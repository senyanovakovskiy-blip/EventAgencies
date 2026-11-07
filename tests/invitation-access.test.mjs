import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { authorizeSite, invitationCookie, invitationDigest } from '../cloud/guest-access.mjs';
import { protectAdminPage } from '../cloud/admin-access.mjs';
import { handleCloudApi } from '../cloud/api.mjs';
import { createCloudStore } from '../cloud/store.mjs';
import { isolatedD1 } from './helpers/isolated-d1.mjs';
import { emptyDraft } from '../public/custom/project-store.js';

const origin = 'https://eventagencies.test';
const token = 'a'.repeat(64); // Synthetic fixture; never a real invitation.
const now = Date.parse('2030-01-01T00:00:00Z');
const expires = '2030-01-31T00:00:00.000Z';
const env = { EA_ADMIN_EMAIL: 'owner@example.invalid', EA_INVITATION_HASH: await invitationDigest(token), EA_INVITATION_EXPIRES: expires };
const owner = { 'oai-authenticated-user-id': 'site-owner', 'oai-authenticated-user-email': env.EA_ADMIN_EMAIL };
const cookie = `${invitationCookie}=${token}`;
const request = (path, headers = {}, method = 'GET', body) => new Request(origin + path, { method, headers, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
const redeem = (body = { token }, headers = {}, config = env) => authorizeSite(request('/api/access/redeem', { Origin: origin, 'Content-Type': 'application/json', ...headers }, 'POST', body), config, now);

test('only owner or a verified invitation passes the whole-site gate', async () => {
  for (const path of ['/', '/catalog', '/my-project', '/admin', '/admin/admin.js', '/%61dmin', '/media/photo.webp', '/assets/index.js', '/api/admin/session', '/api/project-copies']) {
    for (const headers of [{}, { 'X-Admin': 'true', 'X-Role': 'admin' }, { 'oai-authenticated-user-id': 'other', 'oai-authenticated-user-email': 'other@example.invalid' }, { Cookie: invitationCookie + '=invalid' }]) {
      const gate = await authorizeSite(request(path, headers), env, now);
      assert.equal(gate.response.status, path.startsWith('/api/') ? 401 : 403);
      assert.match(gate.response.headers.get('cache-control'), /no-store/);
      assert(!gate.access);
    }
    assert.equal((await authorizeSite(request(path, owner), env, now)).response, undefined);
    const guest = await authorizeSite(request(path, { Cookie: cookie }), env, now);
    assert.equal(guest.response, undefined);
    assert.equal(guest.access.admin, true);
    assert.equal(guest.access.kind, 'invitation');
    assert.equal(protectAdminPage(request('/admin'), env, guest.access), null);
  }
  const mixed = await authorizeSite(request('/admin', { ...owner, Cookie: cookie }), env, now);
  assert.equal(mixed.access, null, 'owner identity takes precedence');
  const duplicate = await authorizeSite(request('/', { Cookie: cookie + '; ' + cookie }), env, now);
  assert.equal(duplicate.response.status, 403);
});

test('redeeming is bounded, same-origin only and sets a secure expiring cookie', async () => {
  const result = await redeem();
  assert.equal(result.response.status, 200);
  assert.deepEqual(await result.response.json(), { ok: true });
  const header = result.response.headers.get('set-cookie');
  for (const part of [cookie, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=2592000']) assert(header.includes(part));
  for (const headers of [{ Origin: 'https://other.test' }, { Origin: '' }, { 'Sec-Fetch-Site': 'cross-site' }]) assert.equal((await redeem({ token }, headers)).response.status, 403);
  for (const body of [{ token: 'b'.repeat(64) }, {}, { token: ['a'.repeat(64)] }, 'bad json', { token, padding: 'x'.repeat(1024) }]) assert.equal((await redeem(body)).response.status, 403);
  assert.equal((await redeem({ token }, { 'Content-Type': 'text/plain' })).response.status, 403);
  assert.equal((await authorizeSite(request('/api/access/redeem'), env, now)).response.status, 405);
  const page = await authorizeSite(request('/invite#' + token), env, now);
  const html = await page.response.text();
  assert(!html.includes(token), 'server never reflects token');
  assert.match(html, /history.replaceState/);
  assert.match(page.response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(page.response.headers.get('referrer-policy'), 'no-referrer');
});

test('expiry and removal/rotation immediately reject cookies and redemption without locking out owner', async () => {
  for (const config of [{}, { ...env, EA_INVITATION_EXPIRES: 'invalid' }, { ...env, EA_INVITATION_EXPIRES: new Date(now).toISOString() }, { ...env, EA_INVITATION_HASH: '' }, { ...env, EA_INVITATION_HASH: await invitationDigest('b'.repeat(64)) }]) {
    assert.equal((await authorizeSite(request('/admin', { Cookie: cookie }), config, now)).response.status, 403);
    assert.equal((await redeem({ token }, {}, config)).response.status, 403);
  }
  const afterExpiry = Date.parse(expires);
  assert.equal((await authorizeSite(request('/api/admin/session', { Cookie: cookie }), env, afterExpiry)).response.status, 401);
  assert.equal((await authorizeSite(request('/admin', owner), env, afterExpiry)).response, undefined);
  assert.equal((await authorizeSite(request('/admin', owner), { EA_ADMIN_EMAIL: env.EA_ADMIN_EMAIL }, now)).response, undefined);
});

test('invited administrator can process existing requests with CSRF protection and isolated personal storage', async t => {
  const db = isolatedD1(t), config = { ...env, DB: db };
  const draft = emptyDraft();
  draft.contact = { name: 'Тест', method: 'email', value: 'synthetic@example.invalid' };
  draft.brief = { ...draft.brief, format: 'conference', city: 'Казань', dateUnknown: true, budgetHelp: true, description: 'ТЕСТ. Не связываться.' };
  draft.selection = [{ agencySlug: 'n-ow', workSlug: 'vk-cloud-conf' }];
  await createCloudStore(db, 'original-customer').save(randomUUID(), draft);
  const invoke = async (path, method = 'GET', body, extra = {}) => {
    const req = request(path, { Cookie: cookie, ...(method === 'GET' ? {} : { Origin: origin, 'Content-Type': 'application/json' }), ...extra }, method, body);
    const gate = await authorizeSite(req, config, now);
    return gate.response || handleCloudApi(req, config, gate.access);
  };
  const session = await (await invoke('/api/admin/session')).json();
  assert.equal(session.authenticated, true);
  assert.equal(session.accessKind, 'invitation');
  assert.equal(session.expiresAt, expires);
  const inbox = await (await invoke('/api/admin/inquiries')).json();
  assert.equal(inbox.total, 1);
  assert.equal((await (await invoke('/api/inquiries')).json()).total, 0);
  const edit = { status: 'working', note: 'Guest operator note', revision: 0 };
  assert.equal((await invoke('/api/admin/inquiries/1', 'PATCH', edit)).status, 403);
  assert.equal((await invoke('/api/admin/inquiries/1', 'PATCH', edit, { 'X-CSRF-Token': session.csrf, Origin: 'https://other.test' })).status, 403);
  assert.equal((await invoke('/api/admin/inquiries/1', 'PATCH', edit, { 'X-CSRF-Token': session.csrf })).status, 200);
  assert.equal(db.sqlite.prepare('SELECT owner_id FROM inquiries WHERE id=1').get().owner_id, 'original-customer');
  const logout = await invoke('/api/admin/logout', 'POST', undefined, { 'X-CSRF-Token': session.csrf });
  assert.equal(logout.status, 200);
  assert.deepEqual(await logout.json(), { ok: true, signOutUrl: '/invite' });
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await authorizeSite(request('/api/admin/session'), config, now)).response.status, 401);
});
