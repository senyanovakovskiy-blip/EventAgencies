import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { handleCloudApi, csrfFor } from '../cloud/api.mjs';
import { createCloudStore } from '../cloud/store.mjs';
import { isolatedD1 } from './helpers/isolated-d1.mjs';
import { emptyDraft } from '../public/custom/project-store.js';
import { makeProjectCopy } from '../public/custom/project-copy-model.js';
import { emptyPreparation } from '../admin/preparation-model.js';
import { emptyTeam, briefFields } from '../admin/workflow-model.js';
import { buildCustomerReply } from '../admin/manual-model.js';
import { buildDiscussionPlan, buildDiscussionAgenda } from '../admin/discussion-plan.js';
import { createInquiryStore, inquiryApi } from '../inquiry-server.mjs';
import { createAdminHandler } from '../admin-server.mjs';
import catalog from '../content/catalog.json' with { type: 'json' };

const origin = 'https://eventagencies.test';
async function api(db, pathname, { owner = 'owner-a', method = 'GET', body, headers = {}, withOrigin = true, csrf = true } = {}) {
  const h = new Headers(headers);
  if (owner !== null) h.set('oai-authenticated-user-id', owner);
  if (!['GET', 'HEAD'].includes(method) && withOrigin && !h.has('origin')) h.set('origin', origin);
  if (!['GET', 'HEAD'].includes(method) && csrf && pathname.startsWith('/api/admin/') && !h.has('x-csrf-token')) h.set('x-csrf-token', await csrfFor(owner, origin));
  if (body !== undefined && !h.has('content-type')) h.set('content-type', 'application/json');
  const request = new Request(origin + pathname, { method, headers: h, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
  const response = await handleCloudApi(request, { DB: db });
  return { status: response.status, headers: response.headers, data: await response.json() };
}
function inquiry() {
  const draft = emptyDraft();
  draft.contact = { name: 'Тестовый клиент', method: 'email', value: 'fixture@example.invalid' };
  draft.brief = { ...draft.brief, format: 'conference', city: 'Казань', dateUnknown: true, budgetHelp: true, description: 'ТЕСТ. Только изолированная проверка.' };
  draft.selection = [{ agencySlug: 'n-ow', workSlug: 'vk-cloud-conf' }];
  return draft;
}
function copyFixture(options = {}) {
  const draft = inquiry();
  draft.workNotes = { 'n-ow/vk-cloud-conf': 'PRIVATE-COPY-NOTE', 'ars-com/other-work': 'UNSELECTED-NOTE' };
  draft.request = { id: 'OLD-REQUEST', createdAt: '2024-01-01', localOnly: true };
  return makeProjectCopy(draft, ['vk-cloud-conf'], options);
}
const saveCopy = (db, name, snapshot = copyFixture(), requestId = randomUUID(), extra = {}) =>
  api(db, '/api/project-copies', { method: 'POST', body: { name, snapshot, requestId }, ...extra });

test('account copies enforce deliberate contact and note sharing, owner isolation and rename retries', async t => {
  const db = isolatedD1(t), key = randomUUID(), snapshot = copyFixture({ includeNotes: false, includeContact: false });
  snapshot.extraSecret = 'UNEXPECTED-EXTRA';
  snapshot.draft.extraSecret = 'UNEXPECTED-DRAFT-EXTRA';
  const saved = await saveCopy(db, '  План на осень  ', snapshot, key);
  assert.equal(saved.status, 201);
  const id = saved.data.item.id;
  assert.equal(saved.data.item.name, 'План на осень');
  assert(!JSON.stringify(saved.data).includes('fixture@example.invalid'));
  const detail = await api(db, '/api/project-copies/' + id);
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.data.snapshot.draft.contact, emptyDraft().contact);
  assert.deepEqual(detail.data.snapshot.draft.workNotes, {});
  assert.equal(detail.data.snapshot.draft.request, null);
  assert(!JSON.stringify(detail.data).includes('UNEXPECTED-EXTRA'));
  assert(!JSON.stringify(detail.data).includes('UNEXPECTED-DRAFT-EXTRA'));
  assert(!JSON.stringify(db.sqlite.prepare('SELECT snapshot_json FROM project_copies WHERE id=?').get(id)).includes('fixture@example.invalid'));

  const selected = copyFixture({ includeNotes: true, includeContact: true });
  const withPrivate = await saveCopy(db, 'С контактом', selected);
  const privateDetail = await api(db, '/api/project-copies/' + withPrivate.data.item.id);
  assert.equal(privateDetail.data.snapshot.draft.contact.value, 'fixture@example.invalid');
  assert.deepEqual(privateDetail.data.snapshot.draft.workNotes, { 'n-ow/vk-cloud-conf': 'PRIVATE-COPY-NOTE' });
  assert(!JSON.stringify((await api(db, '/api/project-copies')).data).includes('fixture@example.invalid'));
  assert.equal((await api(db, '/api/project-copies', { owner: 'owner-b' })).data.total, 0);
  for (const [method, body] of [['GET'], ['PATCH', { name: 'Чужая', expectedName: 'План на осень' }], ['DELETE']]) {
    assert.equal((await api(db, '/api/project-copies/' + id, { owner: 'owner-b', method, body })).status, 404);
  }
  const forged = structuredClone(snapshot);forged.draft.contact.value = 'hidden@example.invalid';
  assert.equal((await saveCopy(db, 'Подмена контакта', forged)).status, 400);
  const forgedNotes = structuredClone(snapshot);forgedNotes.draft.workNotes = { 'n-ow/vk-cloud-conf': 'SHOULD-NOT-SAVE' };
  assert.equal((await saveCopy(db, 'Подмена заметки', forgedNotes)).status, 400);
  const renamed = await api(db, '/api/project-copies/' + id, { method: 'PATCH', body: { name: '  Новый план  ', expectedName: 'План на осень' } });
  assert.equal(renamed.data.item.name, 'Новый план');
  assert.equal((await api(db, '/api/project-copies/' + id, { method: 'PATCH', body: { name: 'Новый план', expectedName: 'План на осень' } })).status, 200);
  assert.equal((await api(db, '/api/project-copies/' + id, { method: 'PATCH', body: { name: 'Потерянная правка', expectedName: 'План на осень' } })).status, 409);
  const retry = await saveCopy(db, '  План на осень  ', snapshot, key.toUpperCase());
  assert.equal(retry.status, 200);assert.equal(retry.data.duplicate, true);assert.equal(retry.data.item.name, 'Новый план');
  assert.equal((await saveCopy(db, 'Другая копия', snapshot, key)).status, 409);
  assert.equal((await api(db, '/api/project-copies/' + id, { method: 'DELETE' })).status, 200);
  assert.equal((await api(db, '/api/project-copies/' + id)).status, 404);
  assert.equal((await api(db, '/api/project-copies/' + id, { method: 'DELETE' })).status, 404);
  // The current data lifecycle removes the retry key with the copy. A delayed
  // original POST is a new creation; there is no retained deletion tombstone.
  const afterDeletion = await saveCopy(db, 'План на осень', snapshot, key);
  assert.equal(afterDeletion.status, 201);
  assert.notEqual(afterDeletion.data.item.id, id);
});

test('copy creation retries and competing payloads preserve one record', async t => {
  const db = isolatedD1(t), key = randomUUID(), snapshot = copyFixture();
  const same = await Promise.all(Array.from({ length: 8 }, () => saveCopy(db, 'Одна копия', snapshot, key)));
  assert.equal(same.filter(value => value.status === 201).length, 1);
  assert.equal(same.filter(value => value.status === 200).length, 7);
  assert.equal(new Set(same.map(value => value.data.item.id)).size, 1);
  const nextKey = randomUUID();
  const competing = await Promise.all([saveCopy(db, 'А', snapshot, nextKey), saveCopy(db, 'Б', snapshot, nextKey)]);
  assert.deepEqual(competing.map(value => value.status).sort(), [201, 409]);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM project_copies').get().n, 2);
  const other = await saveCopy(db, 'А', snapshot, nextKey, { owner: 'owner-b' });
  assert.equal(other.status, 201);
});

test('copies search, sort, pagination and 100-item limit are owner-scoped', async t => {
  const db = isolatedD1(t), snapshot = copyFixture();
  for (let i = 0; i < 96; i++) assert.equal((await saveCopy(db, 'План ' + String(i).padStart(3, '0'), snapshot)).status, 201);
  for (const name of ['Ёлка 10', 'Елка 2', 'Альфа']) assert.equal((await saveCopy(db, name, snapshot)).status, 201);
  const candidates = await Promise.all([
    saveCopy(db, 'Кандидат 1', snapshot), saveCopy(db, 'Кандидат 2', snapshot),
    saveCopy(db, 'Кандидат 3', snapshot), saveCopy(db, 'Кандидат 4', snapshot),
  ]);
  assert.equal(candidates.filter(value => value.status === 201).length, 1);
  assert.equal(candidates.filter(value => value.status === 409 && value.data.error === 'copy_limit').length, 3);
  const listing = await api(db, '/api/project-copies?page=99');
  assert.equal(listing.data.total, 100);assert.equal(listing.data.totalSaved, 100);
  assert.equal(listing.data.page, 10);assert.equal(listing.data.items.length, 10);
  const first = await api(db, '/api/project-copies?sort=oldest');
  assert.equal(first.data.items[0].name, 'План 000');
  const byName = await api(db, '/api/project-copies?sort=name');
  assert.equal(byName.data.items[0].name, 'Альфа');
  const search = await api(db, '/api/project-copies?q=' + encodeURIComponent('елка'));
  assert.deepEqual(search.data.items.map(item => item.name).sort(), ['Елка 2', 'Ёлка 10'].sort());
  assert.equal((await api(db, '/api/project-copies?q=' + encodeURIComponent('ПЛАН 00'))).data.total, 10);
  assert.equal((await api(db, '/api/project-copies?page=0')).status, 400);
  assert.equal((await api(db, '/api/project-copies?sort=unknown')).status, 400);
  assert.equal((await api(db, '/api/project-copies?q=' + 'x'.repeat(121))).status, 400);
  assert.equal((await saveCopy(db, 'Другой аккаунт', snapshot, randomUUID(), { owner: 'owner-b' })).status, 201);
  assert.equal((await api(db, '/api/project-copies/' + first.data.items[0].id, { method: 'DELETE' })).status, 200);
  assert.equal((await saveCopy(db, 'После удаления', snapshot)).status, 201);
});

test('follow-up fields survive older clients, distinguish omission from clearing and stay private', async t => {
  const db = isolatedD1(t);
  assert.equal((await api(db, '/api/inquiries', { method: 'POST', body: { requestId: randomUUID(), payload: inquiry() } })).status, 201);
  let record = (await api(db, '/api/admin/inquiries/1')).data;
  const preparation = { ...emptyPreparation('n-ow', 'vk-cloud-conf'), attraction: 'Подготовка', scenario: 'PRIVATE-SCENARIO' };
  let workflow = structuredClone(record.workflow);
  workflow.preparation = [preparation];
  let result = await api(db, '/api/admin/inquiries/1', { method: 'PATCH', body: { status: 'working', note: 'PRIVATE-OPERATOR-NOTE', revision: record.revision, workflow } });
  assert.equal(result.status, 200);record = result.data;
  const legacyWorkflow = structuredClone(record.workflow);
  delete legacyWorkflow.preparation[0].clientFeedback;
  delete legacyWorkflow.preparation[0].scenarioChanges;
  const legacyRevision = record.revision;

  workflow = structuredClone(record.workflow);
  workflow.preparation[0].clientFeedback = '  PRIVATE-CUSTOMER-FEEDBACK  ';
  workflow.preparation[0].scenarioChanges = '  PRIVATE-CHANGED-SCENARIO  ';
  result = await api(db, '/api/admin/inquiries/1', { method: 'PATCH', body: { status: 'working', note: record.note, revision: record.revision, workflow } });
  assert.equal(result.status, 200);record = result.data;
  assert.equal(record.workflow.preparation[0].clientFeedback, 'PRIVATE-CUSTOMER-FEEDBACK');
  assert.equal(record.workflow.preparation[0].scenarioChanges, 'PRIVATE-CHANGED-SCENARIO');
  assert.equal(record.history[0].details.workflow.preparation[0].clientFeedback, 'PRIVATE-CUSTOMER-FEEDBACK');

  const staleLegacyRetry = await api(db, '/api/admin/inquiries/1', { method: 'PATCH', body: { status: 'working', note: record.note, revision: legacyRevision, workflow: legacyWorkflow } });
  assert.equal(staleLegacyRetry.status, 200);
  assert.equal(staleLegacyRetry.data.revision, record.revision);
  assert.equal(staleLegacyRetry.data.workflow.preparation[0].clientFeedback, 'PRIVATE-CUSTOMER-FEEDBACK');
  legacyWorkflow.preparation[0].questions = 'Уточнить площадку';
  result = await api(db, '/api/admin/inquiries/1', { method: 'PATCH', body: { status: 'working', note: record.note, revision: record.revision, workflow: legacyWorkflow } });
  assert.equal(result.status, 200);record = result.data;
  assert.equal(record.workflow.preparation[0].clientFeedback, 'PRIVATE-CUSTOMER-FEEDBACK');
  assert.equal(record.workflow.preparation[0].scenarioChanges, 'PRIVATE-CHANGED-SCENARIO');

  const clear = structuredClone(record.workflow);
  clear.preparation[0].clientFeedback = '';
  clear.preparation[0].scenarioChanges = '';
  const stale = await api(db, '/api/admin/inquiries/1', { method: 'PATCH', body: { status: 'working', note: record.note, revision: legacyRevision, workflow: clear } });
  assert.equal(stale.status, 409);assert.equal(stale.data.error, 'revision_conflict');
  result = await api(db, '/api/admin/inquiries/1', { method: 'PATCH', body: { status: 'working', note: record.note, revision: record.revision, workflow: clear } });
  assert.equal(result.status, 200);record = result.data;
  assert.equal(record.workflow.preparation[0].clientFeedback, '');
  assert.equal(record.workflow.preparation[0].scenarioChanges, '');
  assert.equal(record.history[1].details.workflow.preparation[0].clientFeedback, 'PRIVATE-CUSTOMER-FEEDBACK');
  const bad = structuredClone(record.workflow);bad.preparation[0].clientFeedback = null;
  assert.equal((await api(db, '/api/admin/inquiries/1', { method: 'PATCH', body: { status: 'working', note: record.note, revision: record.revision, workflow: bad } })).data.error, 'invalid_preparation');

  const fullRecord = (await api(db, '/api/admin/inquiries/1')).data;
  const priorPreparation = fullRecord.history.find(h => h.details.workflow?.preparation?.[0]?.clientFeedback)?.details.workflow.preparation;
  const catalogForOperator = (await api(db, '/api/admin/catalog')).data;
  const plan = buildDiscussionPlan({ entry: priorPreparation[0], preparation: priorPreparation, workflow: fullRecord.workflow, catalog: catalogForOperator, receipt: fullRecord.receipt, siteOrigin: origin });
  const agenda = buildDiscussionAgenda({ entry: priorPreparation[0], preparation: priorPreparation, workflow: fullRecord.workflow, catalog: catalogForOperator, receipt: fullRecord.receipt, siteOrigin: origin });
  assert(plan.text.includes('PRIVATE-CUSTOMER-FEEDBACK'));assert(plan.text.includes('PRIVATE-CHANGED-SCENARIO'));
  assert(agenda.text.includes('PRIVATE-CUSTOMER-FEEDBACK'));assert(agenda.text.includes('PRIVATE-CHANGED-SCENARIO'));
  for (const text of [plan.text, agenda.text]) {
    assert(!text.includes('fixture@example.invalid'));assert(!text.includes('PRIVATE-OPERATOR-NOTE'));
  }
  assert(!agenda.text.includes('PRIVATE-SCENARIO'));
  const reply = buildCustomerReply(fullRecord.receipt, fullRecord.recommendations, fullRecord.workflow.brief, fullRecord.workflow.teams);
  for (const value of ['PRIVATE-SCENARIO', 'PRIVATE-CUSTOMER-FEEDBACK', 'PRIVATE-CHANGED-SCENARIO', 'PRIVATE-OPERATOR-NOTE']) {
    assert(!reply.includes(value));
    assert(!JSON.stringify((await api(db, '/api/inquiries')).data).includes(value));
    assert(!JSON.stringify((await api(db, '/api/inquiries/1')).data).includes(value));
  }
  assert.equal((await api(db, '/api/admin/inquiries/1', { owner: 'owner-b' })).status, 404);
});

test('preparation rejects invalid fields and protects retained pair history and limits', async t => {
  const db = isolatedD1(t), store = createCloudStore(db, 'owner-a');
  await store.save(randomUUID(), inquiry());
  let record = await store.detail(1);
  const patch = workflow => store.update(1, { status: 'working', note: '', revision: record.revision, workflow });
  const item = { ...emptyPreparation('n-ow', 'vk-cloud-conf'), scenario: 'Набросок', clientFeedback: 'Реальная заметка' };
  let workflow = structuredClone(record.workflow);workflow.preparation = [item];record = await patch(workflow);
  for (const [mutate, code] of [
    [w => { w.preparation = []; }, 'keep_preparation_history'],
    [w => { w.preparation.push(structuredClone(w.preparation[0])); }, 'invalid_preparation'],
    [w => { w.preparation[0].scenarioChanges = 'x'.repeat(2001); }, 'invalid_preparation'],
    [w => { w.preparation.push(emptyPreparation('unknown-team', null)); }, 'invalid_preparation'],
    [w => { w.preparation.push(emptyPreparation('ars-com', 'vk-cloud-conf')); }, 'invalid_preparation'],
    [w => { w.preparation = Array.from({ length: 31 }, (_, i) => emptyPreparation(catalog.agencies[i].slug, null)); }, 'invalid_preparation'],
  ]) {
    const input = structuredClone(record.workflow);mutate(input);
    await assert.rejects(patch(input), { code });
  }
  const oversized = structuredClone(record.workflow);
  oversized.preparation = [
    item,
    ...catalog.agencies.filter(a => a.slug !== 'n-ow').slice(0, 7).map(a => ({ ...emptyPreparation(a.slug, null), scenario: 'x'.repeat(4000) })),
  ];
  await assert.rejects(patch(oversized), { code: 'preparation_too_large' });
  assert.equal((await store.detail(1)).revision, record.revision);
  assert.deepEqual((await store.detail(1)).workflow.preparation, [item]);
});

test('cloud API rejects unauthenticated, cross-site, wrong-CSRF and oversized mutations', async t => {
  const db = isolatedD1(t), snapshot = copyFixture(), body = { requestId: randomUUID(), name: 'Тест', snapshot };
  for (const pathname of ['/api/project-copies', '/api/inquiries', '/api/admin/catalog']) {
    assert.equal((await api(db, pathname, { owner: null })).status, 401);
  }
  for (const pathname of ['/api/project-copies', '/api/inquiries', '/api/admin/inquiries/1']) {
    const method = pathname.includes('/admin/') ? 'PATCH' : 'POST';
    assert.equal((await api(db, pathname, { method, body, withOrigin: false })).status, 403);
    assert.equal((await api(db, pathname, { method, body, headers: { Origin: 'https://evil.example.invalid' } })).status, 403);
    assert.equal((await api(db, pathname, { method, body, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  }
  assert.equal((await api(db, '/api/admin/inquiries/1', { method: 'PATCH', body, csrf: false })).data.error, 'csrf_required');
  assert.equal((await api(db, '/api/admin/inquiries/1', { method: 'PATCH', body, headers: { 'X-CSRF-Token': await csrfFor('owner-b', origin) } })).data.error, 'csrf_required');
  assert.equal((await api(db, '/api/project-copies', { method: 'POST', body, headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await api(db, '/api/project-copies', { method: 'POST', body: '{' })).status, 400);
  assert.equal((await api(db, '/api/project-copies', { method: 'POST', body: '{}', headers: { 'Content-Length': '1048577' } })).status, 413);
  assert.equal((await api(db, '/api/project-copies', { method: 'POST', body: 'x'.repeat(1048577) })).status, 413);
  assert.equal((await api(db, '/api/admin/inquiries/1', { method: 'PATCH', body: 'x'.repeat(262145) })).status, 413);
  assert.equal((await api(db, '/api/project-copies/1', { method: 'PATCH', body: 'x'.repeat(2049) })).status, 413);
  const catalogResponse = await api(db, '/api/admin/catalog');
  assert.equal(catalogResponse.status, 200);assert.equal(catalogResponse.headers.get('cache-control'), 'no-store');
  assert.equal(catalogResponse.headers.get('access-control-allow-origin'), null);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM project_copies').get().n, 0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM inquiries').get().n, 0);
});

test('project copy migration preserves an existing request, its private workflow and history', async t => {
  const db = isolatedD1(t, 2), store = createCloudStore(db, 'owner-a'), key = randomUUID();
  const original = await store.save(key, inquiry());
  let record = await store.detail(1), workflow = structuredClone(record.workflow);
  workflow.preparation = [{ ...emptyPreparation('n-ow', 'vk-cloud-conf'), clientFeedback: 'Запись до миграции' }];
  record = await store.update(1, { status: 'working', note: 'Старая заметка', revision: 0, workflow });
  const before = db.sqlite.prepare('SELECT * FROM inquiries WHERE id=1').get();
  const beforeHistory = db.sqlite.prepare('SELECT * FROM inquiry_history').all();
  db.sqlite.exec(fs.readFileSync(new URL('../drizzle/0002_slim_iron_monger.sql', import.meta.url), 'utf8'));
  assert.deepEqual(db.sqlite.prepare('SELECT * FROM inquiries WHERE id=1').get(), before);
  assert.deepEqual(db.sqlite.prepare('SELECT * FROM inquiry_history').all(), beforeHistory);
  assert.deepEqual(await store.detail(1), record);
  assert.deepEqual((await store.save(key, inquiry())).receipt, original.receipt);
  assert.equal((await saveCopy(db, 'После миграции')).status, 201);
});

function mockRequest(pathname, { method = 'GET', body, headers = {}, remote = '127.0.0.1' } = {}) {
  const bytes = body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))];
  const req = Readable.from(bytes);
  req.url = pathname;req.method = method;
  req.socket = { localPort: 8123, remoteAddress: remote };
  req.headers = { host: '127.0.0.1:8123', ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers };
  return req;
}
async function mockCall(handler, pathname, options) {
  const req = mockRequest(pathname, options);
  const res = {
    writeHead(status, headers) { this.status = status;this.headers = headers;return this; },
    end(content = '') { this.content = String(content);return this; },
  };
  assert.equal(await handler(req, res), true);
  return { status: res.status, headers: res.headers, data: JSON.parse(res.content) };
}

test('local server keeps retry identity and protects its real admin handlers', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eventagencies-test-'));
  const filename = path.join(dir, 'private', 'requests.sqlite');
  let store = createInquiryStore(filename, catalog);
  t.after(() => { store?.close();fs.rmSync(dir, { recursive: true, force: true }); });
  const localInquiry = (pathname, options) => mockCall((req, res) => inquiryApi(req, res, store), pathname, options);
  const localAdmin = (pathname, options) => mockCall(createAdminHandler(store.admin), pathname, options);
  const key = randomUUID(), body = { requestId: key, payload: inquiry() };
  const first = await localInquiry('/api/inquiries', { method: 'POST', body });
  assert.equal(first.status, 201);assert.equal(first.data.receipt.localServer, true);
  const retry = await localInquiry('/api/inquiries', { method: 'POST', body: { ...body, requestId: key.toUpperCase() } });
  assert.equal(retry.status, 200);assert.equal(retry.data.duplicate, true);
  assert.deepEqual(retry.data.receipt, first.data.receipt);
  assert.equal((await localInquiry('/api/inquiries', { method: 'POST', body: { ...body, payload: { ...body.payload, brief: { ...body.payload.brief, city: 'Москва' } } } })).status, 409);
  assert.equal((await localInquiry('/api/inquiries', { method: 'POST', body, headers: { host: 'evil.example.invalid:8123' } })).status, 403);
  assert.equal((await localInquiry('/api/inquiries', { method: 'POST', body, headers: { origin: 'http://evil.example.invalid' } })).status, 403);
  assert.equal((await localInquiry('/api/inquiries', { method: 'POST', body, headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await localInquiry('/api/inquiries', { method: 'POST', body: 'x'.repeat(32769) })).status, 413);
  assert.equal((await localInquiry('/api/health')).data.notifications, false);
  assert.equal((await localAdmin('/api/admin/inquiries')).status, 401);

  const password = fs.readFileSync(path.join(dir, 'private', 'admin-access.txt'), 'utf8').match(/Пароль: ([A-Za-z0-9_-]{32})/)[1];
  const adminHandler = createAdminHandler(store.admin);
  const authenticated = (pathname, options) => mockCall(adminHandler, pathname, options);
  const login = await authenticated('/api/admin/login', { method: 'POST', body: { username: 'admin', password } });
  assert.equal(login.status, 200);assert.match(login.headers['Set-Cookie'], /HttpOnly; SameSite=Strict/);
  const cookie = login.headers['Set-Cookie'].split(';')[0], csrf = login.data.csrf;
  assert.equal((await authenticated('/api/admin/inquiries', { headers: { cookie } })).data.total, 1);
  assert.equal((await authenticated('/api/admin/inquiries/1', { method: 'PATCH', headers: { cookie }, body: { status: 'working', note: 'Приватная заметка', revision: 0 } })).status, 403);
  const updated = await authenticated('/api/admin/inquiries/1', { method: 'PATCH', headers: { cookie, 'x-csrf-token': csrf }, body: { status: 'working', note: 'Приватная заметка', revision: 0 } });
  assert.equal(updated.status, 200);assert.equal(updated.data.history.length, 1);
  assert.equal((await authenticated('/api/admin/inquiries', { headers: { cookie, 'sec-fetch-site': 'cross-site' } })).status, 403);
  const logout = await authenticated('/api/admin/logout', { method: 'POST', headers: { cookie, 'x-csrf-token': csrf } });
  assert.equal(logout.status, 200);
  assert.equal((await authenticated('/api/admin/inquiries', { headers: { cookie } })).status, 401);
  store.close();store = createInquiryStore(filename, catalog);
  assert.equal(store.admin.detail(1).note, 'Приватная заметка');
  assert.equal(store.admin.detail(1).history.length, 1);
});

test('local retry recognizes keys from the previous case-sensitive implementation', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eventagencies-legacy-'));
  const filename = path.join(dir, 'requests.sqlite');
  let store = createInquiryStore(filename, catalog);
  t.after(() => { store?.close();fs.rmSync(dir, { recursive: true, force: true }); });
  const key = 'a1b2c3d4-e5f6-4a12-9abc-def012345678';
  const receipt = store.save(key, inquiry()).receipt;
  store.close();store = null;
  const sql = new DatabaseSync(filename);
  sql.prepare('UPDATE inquiries SET key_hash=?').run(createHash('sha256').update(key.toUpperCase()).digest('hex'));
  sql.close();
  store = createInquiryStore(filename, catalog);
  assert.equal(store.save(key, inquiry()).duplicate, true);
  assert.deepEqual(store.save(key.toUpperCase(), inquiry()).receipt, receipt);
  assert.equal(store.admin.list().total, 1);
  store.close();store = null;
  const oldMixed = 'A1b2C3d4-e5F6-4A12-9aBc-dEf012345678';
  const oldSql = new DatabaseSync(filename);
  oldSql.prepare('UPDATE inquiries SET key_hash=?').run(createHash('sha256').update(oldMixed).digest('hex'));
  oldSql.close();
  store = createInquiryStore(filename, catalog);
  assert.deepEqual(store.save(oldMixed, inquiry()).receipt, receipt);
  assert.equal(store.admin.list().total, 1);
});

test('exact legacy UUID spelling preserves its receipt when older case variants coexist', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eventagencies-legacy-pair-'));
  const filename = path.join(dir, 'requests.sqlite');
  let store = createInquiryStore(filename, catalog);
  t.after(() => { store?.close();fs.rmSync(dir, { recursive: true, force: true }); });
  const key = 'a1b2c3d4-e5f6-4a12-9abc-def012345678';
  const lowerPayload = inquiry();
  const upperPayload = { ...inquiry(), brief: { ...inquiry().brief, city: 'Москва' } };
  const lowerReceipt = store.save(key, lowerPayload).receipt;
  const upperReceipt = store.save('b1b2c3d4-e5f6-4a12-9abc-def012345678', upperPayload).receipt;
  store.close();store = null;
  const sql = new DatabaseSync(filename);
  sql.prepare('UPDATE inquiries SET key_hash=? WHERE id=2').run(createHash('sha256').update(key.toUpperCase()).digest('hex'));
  sql.close();
  store = createInquiryStore(filename, catalog);
  assert.deepEqual(store.save(key.toUpperCase(), upperPayload), { receipt: upperReceipt, duplicate: true });
  assert.deepEqual(store.save(key, lowerPayload), { receipt: lowerReceipt, duplicate: true });
  assert.throws(() => store.save(key.toUpperCase(), lowerPayload), error => error.status === 409);
  assert.equal(store.admin.list().total, 2);
});

test('refusal and negative consent from an older brief are rechecked, while current refusals remain final', async t => {
  async function fixture(team) {
    const db = isolatedD1(t), store = createCloudStore(db, 'owner-a');
    await store.save(randomUUID(), inquiry());
    let record = await store.detail(1);
    async function edit(change) {
      const workflow = structuredClone(record.workflow);change(workflow);
      record = await store.update(1, { status: 'working', note: '', revision: record.revision, workflow });
    }
    await edit(w => { for (const field of Object.keys(briefFields)) w.brief[field] = 'Уточнено: ' + field;w.brief.confirmationNote = 'Подтверждено клиентом'; });
    await edit(w => { w.brief.confirmed = true; });
    await edit(w => { w.teams = [team]; });
    assert.equal((await store.list()).items[0].nextAction.stage, 'selection');
    await edit(w => { w.brief.budget = 'Новые условия'; });
    await edit(w => { w.brief.confirmed = true; });
    assert.equal((await store.list()).items[0].nextAction.action, 'Перепроверить ответ по актуальному брифу');
    return { store, edit };
  }
  const declined = await fixture({ ...emptyTeam('n-ow'), response: 'declined', responseNote: 'Агентство ответило', refusalReason: 'Старый бюджет' });
  await declined.edit(w => { w.teams[0].reconfirm = { response: true }; });
  assert.equal((await declined.store.list()).items[0].nextAction.stage, 'selection');

  const noConsent = await fixture({ ...emptyTeam('n-ow'), response: 'interested', responseNote: 'Агентство заинтересовано', customerConsent: 'no', customerConsentNote: 'Отказ на старых условиях', agencyConsent: 'yes', agencyConsentNote: 'Агентство согласно' });
  await noConsent.edit(w => { w.teams[0].reconfirm = { response: true }; });
  assert.equal((await noConsent.store.list()).items[0].nextAction.action, 'Уточнить решение заказчика по актуальному брифу');
  await noConsent.edit(w => { w.teams[0].reconfirm = { customerConsent: true }; });
  assert.equal((await noConsent.store.list()).items[0].nextAction.stage, 'selection');
  const agencyRefusal = await fixture({ ...emptyTeam('n-ow'), response: 'interested', responseNote: 'Агентство заинтересовано', customerConsent: 'yes', customerConsentNote: 'Заказчик согласен', agencyConsent: 'no', agencyConsentNote: 'Отказ на старых условиях' });
  await agencyRefusal.edit(w => { w.teams[0].reconfirm = { response: true, customerConsent: true }; });
  assert.equal((await agencyRefusal.store.list()).items[0].nextAction.action, 'Уточнить решение агентства по актуальному брифу');
  await agencyRefusal.edit(w => { w.teams[0].reconfirm = { agencyConsent: true }; });
  assert.equal((await agencyRefusal.store.list()).items[0].nextAction.stage, 'selection');
});
