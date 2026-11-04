import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { handleCloudApi, csrfFor } from '../cloud/api.mjs';
import { isAdministrator, protectAdminPage } from '../cloud/admin-access.mjs';
import { createCloudStore } from '../cloud/store.mjs';
import { createCloudAdminStore } from '../cloud/admin-store.mjs';
import { isolatedD1 } from './helpers/isolated-d1.mjs';
import { emptyDraft } from '../public/custom/project-store.js';
import { makeProjectCopy } from '../public/custom/project-copy-model.js';

const origin = 'https://eventagencies.test';
const configured = { EA_ADMIN_EMAIL: 'administrator@example.invalid' };
const identities = {
  admin: { 'oai-authenticated-user-id': 'operator', 'oai-authenticated-user-email': configured.EA_ADMIN_EMAIL },
  first: { 'oai-authenticated-user-id': 'first-visitor', 'oai-authenticated-user-email': 'first@example.invalid' },
  second: { 'oai-authenticated-user-id': 'second-visitor', 'oai-authenticated-user-email': 'second@example.invalid' },
};
function draft(city = 'Казань') {
  const value = emptyDraft();
  value.contact = { name: 'Тестовая заявка', method: 'email', value: 'synthetic@example.invalid' };
  value.brief = { ...value.brief, format: 'conference', city, dateUnknown: true, budgetHelp: true, description: 'ТЕСТ. Не связываться.' };
  value.selection = [{ agencySlug: 'n-ow', workSlug: 'vk-cloud-conf' }];
  return value;
}
async function api(db, role, path, { method = 'GET', body, config = configured, headers = {} } = {}) {
  const identity = identities[role] || {};
  const h = { ...identity, ...headers };
  if (method !== 'GET') {
    h.Origin = origin; h['Content-Type'] = 'application/json';
    h['X-CSRF-Token'] = await csrfFor(identity['oai-authenticated-user-id'], origin);
  }
  const response = await handleCloudApi(new Request(origin + path, { method, headers: h, ...(body ? { body: JSON.stringify(body) } : {}) }), { DB: db, ...config });
  return { status: response.status, data: await response.json() };
}

test('admin authorization fails closed and protects HTML, assets and every API route', async () => {
  const request = role => new Request(origin + '/admin', { headers: identities[role] });
  assert.equal(isAdministrator(request('admin'), configured), true);
  for (const env of [{}, { EA_ADMIN_EMAIL: '*' }, { EA_ADMIN_EMAIL: 'administrator@example.invalid,first@example.invalid' }]) {
    assert.equal(isAdministrator(request('admin'), env), false);
    assert.equal((await api(null, 'admin', '/api/admin/session', { config: env })).status, 403);
  }
  assert.equal(isAdministrator(new Request(origin, { headers: { 'oai-authenticated-user-email': configured.EA_ADMIN_EMAIL } }), configured), false);
  assert.equal(isAdministrator(new Request(origin, { headers: { 'oai-authenticated-user-id': 'operator' } }), configured), false);
  assert.equal(protectAdminPage(request('admin'), configured), null);
  for (const path of ['/admin', '/admin/', '/admin/index.html', '/admin/admin.js', '/%61dmin', '/admin%2Fadmin.js', '/foo%2F..%2Fadmin/admin.js', '/%61dmin%5Cadmin.js']) {
    const response = protectAdminPage(new Request(origin + path, { headers: identities.first }), configured);
    assert.equal(response.status, 403); assert.match(response.headers.get('cache-control'), /no-store/);
    assert.match(await response.text(), /нет доступа/);
  }
  const anonymous = protectAdminPage(new Request(origin + '/admin'), configured);
  assert.equal(anonymous.status, 302); assert.equal(anonymous.headers.get('location'), origin + '/signin-with-chatgpt?return_to=/admin');
  assert.equal(protectAdminPage(new Request(origin + '/catalog'), configured), null);
  const head = protectAdminPage(new Request(origin + '/admin', { method: 'HEAD', headers: identities.first }), configured);
  assert.equal(await head.text(), '');
  for (const [path, method] of [['session', 'GET'], ['catalog', 'GET'], ['inquiries', 'GET'], ['inquiries/1', 'GET'], ['inquiries/1', 'PATCH'], ['login', 'POST'], ['logout', 'POST']]) {
    const result = await api(null, 'first', '/api/admin/' + path, { method, headers: { 'X-Admin': 'true', 'X-Role': 'admin' }, body: method === 'GET' ? undefined : {} });
    assert.deepEqual(result, { status: 403, data: { error: 'admin_required' } });
  }
});

test('two visitors submit; administrator processes both while private customer data stays isolated', async t => {
  const db = isolatedD1(t);
  for (const role of ['first', 'second']) {
    assert.equal((await api(db, role, '/api/inquiries', { method: 'POST', body: { requestId: randomUUID(), payload: draft(role) } })).status, 201);
  }
  const list = await api(db, 'admin', '/api/admin/inquiries');
  assert.equal(list.status, 200); assert.equal(list.data.total, 2); assert.equal(list.data.counts.new, 2);
  assert.equal((await api(db, 'admin', '/api/inquiries')).data.total, 0);
  for (const role of ['first', 'second']) assert.equal((await api(db, role, '/api/inquiries')).data.total, 1);
  const update = { status: 'working', note: 'INTERNAL-OPERATOR-NOTE', revision: 0 };
  const changed = await api(db, 'admin', '/api/admin/inquiries/1', { method: 'PATCH', body: update });
  assert.equal(changed.status, 200); assert.equal(changed.data.revision, 1); assert.equal(changed.data.history.length, 1);
  const receipt = await api(db, 'first', '/api/inquiries/1');
  assert.equal(receipt.data.status, 'working'); assert(!JSON.stringify(receipt.data).includes(update.note));
  assert.equal((await api(db, 'second', '/api/inquiries/1')).status, 404);
  assert.equal((await api(db, 'first', '/api/inquiries/2')).status, 404);
  assert.equal(db.sqlite.prepare('SELECT owner_id FROM inquiries WHERE id=1').get().owner_id, 'first-visitor');
  assert.equal(db.sqlite.prepare('SELECT owner_id FROM inquiry_history WHERE inquiry_id=1').get().owner_id, 'first-visitor');
  const copy = await api(db, 'first', '/api/project-copies', { method: 'POST', body: { requestId: randomUUID(), name: 'Личная копия', snapshot: makeProjectCopy(draft(), []) } });
  assert.equal(copy.status, 201);
  for (const role of ['second', 'admin']) assert.equal((await api(db, role, '/api/project-copies/' + copy.data.item.id)).status, 404);
  assert.equal((await api(db, 'first', '/api/admin/inquiries/1', { method: 'PATCH', body: update })).status, 403);
  assert.equal((await api(db, 'admin', '/api/admin/inquiries/9999')).status, 404);
});

test('global inbox keeps literal search, pagination, status counts and atomic edits', async t => {
  const db = isolatedD1(t), admin = createCloudAdminStore(db);
  for (let i = 0; i < 27; i++) await createCloudStore(db, i % 2 ? 'first-visitor' : 'second-visitor').save(randomUUID(), draft(i === 0 ? '50%_город' : 'Казань'));
  assert.equal((await admin.list()).total, 27);
  assert.equal((await admin.list({ page: 2 })).items.length, 2);
  assert.equal((await admin.list({ q: '%_' })).total, 1);
  await admin.update(1, { status: 'working', note: '', revision: 0 });
  const filtered = await admin.list({ status: 'working' });
  assert.equal(filtered.total, 1); assert.equal(filtered.counts.new, 26); assert.equal(filtered.counts.working, 1);
  assert.equal((await admin.list()).items[0].status, 'new');
  const outcomes = await Promise.allSettled([
    admin.update(1, { status: 'working', note: 'First', revision: 1 }),
    admin.update(1, { status: 'working', note: 'Second', revision: 1 }),
  ]);
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(r => r.status === 'rejected').reason.code, 'revision_conflict');
  const before = await admin.detail(1);
  db.sqlite.exec("CREATE TRIGGER reject_admin_history BEFORE INSERT ON inquiry_history BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
  await assert.rejects(admin.update(1, { status: 'working', note: 'Must roll back', revision: before.revision }));
  assert.deepEqual(await admin.detail(1), before);
  await assert.rejects(admin.list({ status: 'unknown' }), { code: 'invalid_status' });
  await assert.rejects(admin.list({ page: 0 }), { code: 'invalid_filter' });
  await assert.rejects(admin.list({ q: 'x'.repeat(181) }), { code: 'invalid_filter' });
  assert.equal((await createCloudStore(db, 'first-visitor').list()).total, 13);
});
