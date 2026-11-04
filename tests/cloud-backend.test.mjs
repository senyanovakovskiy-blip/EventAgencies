import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { handleCloudApi, csrfFor } from '../cloud/api.mjs';
import { createCloudStore, digest } from '../cloud/store.mjs';
import { emptyDraft } from '../public/custom/project-store.js';
import { recommendationKey, replyKey } from '../admin/manual-model.js';
import { emptyTeam, briefFields, briefConfirmed, evidenceCurrent } from '../admin/workflow-model.js';

// Execute the generated migration and the production SQL against a small D1
// interface adapter. BEGIN is confined to this adapter to emulate D1 batch().
function database(t, migrationCount = Infinity) {
  const sqlite = new DatabaseSync(':memory:');
  const directory = new URL('../drizzle/', import.meta.url);
  const migrations = fs.readdirSync(directory).filter(name => name.endsWith('.sql')).sort();
  assert(migrations.length, 'Generate the Drizzle migration before running cloud tests');
  for (const name of migrations.slice(0, migrationCount)) sqlite.exec(fs.readFileSync(new URL(name, directory), 'utf8'));
  const db = {
    sqlite, batches: 0,
    withSession(constraint) { assert.equal(constraint, 'first-primary'); return this; },
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      const prepared = args => ({
        bind: (...values) => prepared(values),
        first: async () => statement.get(...args) || null,
        all: async () => ({ results: statement.all(...args), success: true }),
        execute: () => {
          if (statement.columns().length) return { results: statement.all(...args), success: true };
          const result = statement.run(...args);
          return { results: [], success: true, meta: { changes: Number(result.changes) } };
        },
      });
      return prepared([]);
    },
    async batch(statements) {
      this.batches++; sqlite.exec('BEGIN');
      try { const result = statements.map(statement => statement.execute()); sqlite.exec('COMMIT'); return result; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  t.after(() => sqlite.close()); return db;
}
function payload() {
  const draft = emptyDraft();
  draft.contact = { name: 'Тест облачной заявки', method: 'email', value: 'cloud-test@example.invalid' };
  draft.brief = { ...draft.brief, format: 'conference', city: 'Казань', dateUnknown: true, budgetHelp: true, description: 'ТЕСТ. Изолированная проверка, не связываться.' };
  draft.selection = [{ agencySlug: 'n-ow', workSlug: 'vk-cloud-conf' }];
  return draft;
}
const origin = 'https://eventagencies.test';
async function call(db, path, { owner = 'owner-a', method = 'GET', body, headers = {}, csrf = true } = {}) {
  const requestHeaders = { ...(owner === null ? {} : { 'oai-authenticated-user-id': owner, 'oai-authenticated-user-email': owner === 'owner-a' ? 'admin@example.invalid' : 'visitor@example.invalid' }), ...headers };
  if (method !== 'GET' && method !== 'HEAD') {
    requestHeaders.Origin ??= origin;
    if (csrf && path.startsWith('/api/admin/')) requestHeaders['X-CSRF-Token'] ??= await csrfFor(owner, origin);
  }
  if (body !== undefined) requestHeaders['Content-Type'] ??= 'application/json';
  const request = new Request(origin + path, { method, headers: requestHeaders, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
  const response = await handleCloudApi(request, { DB: db, EA_ADMIN_EMAIL: 'admin@example.invalid' });
  return { response, data: response ? await response.json() : null };
}

test('cloud identity, CSRF, origin and health contract', async t => {
  const db = database(t);
  for (const path of ['/api/health', '/api/admin/session', '/api/admin/inquiries', '/api/inquiries']) assert.equal((await call(db, path, { owner: null })).response.status, 401);
  assert.equal((await call(db, '/catalog')).response, null);
  const session = await call(db, '/api/admin/session');
  assert.equal(session.data.authenticated, true);assert.equal(session.data.username, 'Владелец');
  assert.equal(session.data.csrf, (await call(db, '/api/admin/session')).data.csrf);
  assert.equal((await call(db, '/api/admin/session', { owner: 'owner-b' })).response.status, 403);
  assert.notEqual(session.data.csrf, await csrfFor('owner-a', 'https://other.test'));
  assert.equal(session.response.headers.get('cache-control'), 'no-store');
  const health = await call(db, '/api/health');
  assert.deepEqual(health.data, { service: 'eventagencies-cloud-inquiries', storage: 'd1', notifications: false });
  assert.equal((await call(db, '/api/admin/logout', { method: 'POST', csrf: false })).response.status, 403);
  assert.equal((await call(db, '/api/admin/logout', { method: 'POST', headers: { 'X-CSRF-Token': await csrfFor('owner-b', origin) } })).response.status, 403);
  assert.equal((await call(db, '/api/admin/logout', { method: 'POST', headers: { Origin: 'https://other.test' } })).response.status, 403);
  const logout = await call(db, '/api/admin/logout', { method: 'POST' });
  assert.deepEqual(logout.data, { ok: true, signOutUrl: '/signout-with-chatgpt?return_to=/admin' });
  assert.equal((await call(db, '/api/admin/login', { method: 'POST', body: {} })).response.status, 405);
  const request = new Request(origin + '/api/inquiries', { method: 'POST', headers: { 'oai-authenticated-user-id': 'owner-a', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal((await handleCloudApi(request, { DB: db })).status, 403, 'Mutations without Origin are rejected');
});

test('cloud submission retries, owner isolation and immutable receipts', async t => {
  const db = database(t), key = randomUUID(), input = payload();
  const submit = options => call(db, '/api/inquiries', { method: 'POST', body: { requestId: key, payload: input }, ...options });
  const first = await submit();assert.equal(first.response.status, 201);assert.equal(first.data.receipt.localServer, false);
  assert.equal(first.data.receipt.selection[0].work.title, 'VK Cloud Conf');
  const retries = await Promise.all(Array.from({ length: 8 }, () => submit()));
  for (const retry of retries) { assert.equal(retry.response.status, 200);assert.deepEqual(retry.data.receipt, first.data.receipt); }
  assert.equal((await call(db, '/api/inquiries', { method: 'POST', body: { requestId: key.toUpperCase(), payload: input } })).response.status, 200);
  assert.equal((await submit({ body: { requestId: key, payload: { ...input, brief: { ...input.brief, city: 'Москва' } } } })).response.status, 409);
  assert.equal((await call(db, '/api/admin/inquiries', { owner: 'owner-b' })).response.status, 403);
  assert.equal((await call(db, '/api/admin/inquiries/1', { owner: 'owner-b' })).response.status, 403);
  assert.equal((await call(db, '/api/admin/inquiries/1', { owner: 'owner-b', method: 'PATCH', body: { status: 'closed', note: '', revision: 0 } })).response.status, 403);
  const other = await submit({ owner: 'owner-b' });assert.equal(other.response.status, 201);assert.notEqual(other.data.receipt.id, first.data.receipt.id);
  assert.equal((await call(db, '/api/admin/inquiries')).data.total, 2);
  assert.equal((await call(db, '/api/inquiries', { owner: 'owner-b' })).data.total, 1);
  const saved = (await call(db, '/api/admin/inquiries/1')).data;
  assert.deepEqual(saved.receipt, first.data.receipt);assert.equal(saved.statusChangedAt, first.data.receipt.createdAt);
  await call(db, '/api/admin/inquiries/1', { method: 'PATCH', body: { status: 'working', note: 'PRIVATE-NOTE', revision: 0 } });
  const retried = await submit();assert.deepEqual(retried.data.receipt, first.data.receipt);assert(!JSON.stringify(retried.data).includes('PRIVATE-NOTE'));
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM inquiries').get().n, 2);
});

test('concurrent creation deduplicates and changed concurrent payload conflicts', async t => {
  const db = database(t), store = createCloudStore(db, 'owner-a'), key = randomUUID();
  const results = await Promise.all(Array.from({ length: 8 }, () => store.save(key, payload())));
  assert.equal(results.filter(result => !result.duplicate).length, 1);
  assert.equal(new Set(results.map(result => result.receipt.id)).size, 1);
  const secondKey = randomUUID(), changed = payload();changed.brief.city = 'Другой город';
  const raced = await Promise.allSettled([store.save(secondKey, payload()), store.save(secondKey, changed)]);
  assert.equal(raced.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(raced.find(result => result.status === 'rejected').reason.status, 409);
});

test('input validation and HTTP limits do not create requests', async t => {
  const db = database(t), input = payload();
  const submit = (value, headers) => call(db, '/api/inquiries', { method: 'POST', body: { requestId: randomUUID(), payload: value }, headers });
  for (const value of [null, {}, { ...input, selection: Array(4).fill(input.selection[0]) }, { ...input, selection: [input.selection[0], input.selection[0]] }, { ...input, selection: [{ agencySlug: 'ars-com', workSlug: 'vk-cloud-conf' }] }, { ...input, contact: { ...input.contact, value: 'invalid-email' } }]) assert.equal((await submit(value)).response.status, 400);
  assert.equal((await submit(input, { Origin: 'https://other.test' })).response.status, 403);
  assert.equal((await submit(input, { 'Sec-Fetch-Site': 'cross-site' })).response.status, 403);
  assert.equal((await call(db, '/api/inquiries', { method: 'POST', body: '{' })).response.status, 400);
  assert.equal((await call(db, '/api/inquiries', { method: 'POST', body: '{}', headers: { 'Content-Type': 'text/plain' } })).response.status, 415);
  assert.equal((await call(db, '/api/inquiries', { method: 'POST', body: 'x'.repeat(32769) })).response.status, 413);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM inquiries').get().n, 0);
  assert.equal((await submit({ ...input, selection: [] })).response.status, 201);
});

test('recommendation validation, reply freshness and status timestamps', async t => {
  const db = database(t), store = createCloudStore(db, 'owner-a');await store.save(randomUUID(), payload());
  const original = await store.detail(1), rec = { agencySlug: 'ars-com', workSlug: 'positive-hack-days', reason: 'Опыт технических событий', questions: 'Дата и стоимость' };
  const update = { status: 'working', note: '', revision: 0, recommendations: [rec] };
  for (const recommendations of [[rec, rec], Array(4).fill(rec), [{ ...rec, workSlug: 'vk-cloud-conf' }], [{ ...rec, reason: 'x'.repeat(1201) }]]) await assert.rejects(store.update(1, { ...update, recommendations }), { code: 'invalid_recommendations' });
  await assert.rejects(store.update(1, { ...update, status: 'prepared', recommendations: [] }), { code: 'shortlist_incomplete' });
  let record = await store.update(1, update);assert.equal(record.recommendations[0].name, 'ARS COM');
  const statusTime = record.statusChangedAt;
  record = await store.update(1, { ...update, revision: record.revision, note: 'Internal' });assert.equal(record.statusChangedAt, statusTime);
  const ready = { status: 'prepared', note: record.note, revision: record.revision, replyText: 'Ответ с ручными правками', replyBasis: await digest(replyKey([rec], record.workflow.brief, record.workflow.teams)) };
  record = await store.update(1, ready);assert.equal(record.replyStale, false);
  const repeated = await store.update(1, ready);assert.equal(repeated.revision, record.revision);assert.equal(repeated.history.length, record.history.length);
  record = await store.update(1, { ...ready, revision: record.revision, recommendations: [{ ...rec, questions: 'Уточнить площадку' }] });
  assert.equal(record.replyStale, true);assert.equal(record.replyText, ready.replyText);assert.deepEqual(record.receipt, original.receipt);
  const reopened = createCloudStore(db, 'owner-a');assert.deepEqual(await reopened.detail(1), record);
  await assert.rejects(store.update(1, { ...ready, note: 'Stale overwrite' }), { code: 'revision_conflict' });
});

test('concurrent admin changes use atomic revision guard and one matching history entry', async t => {
  const db = database(t), store = createCloudStore(db, 'owner-a');await store.save(randomUUID(), payload());
  const outcomes = await Promise.allSettled([
    store.update(1, { status: 'working', note: 'First edit', revision: 0 }),
    store.update(1, { status: 'closed', note: 'Second edit', revision: 0 }),
  ]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(result => result.status === 'rejected').reason.status, 409);
  let record = await store.detail(1);assert.equal(record.revision, 1);assert.equal(record.history.length, 1);
  assert.equal(record.history[0].note, record.note);assert.equal(record.history[0].status, record.status);
  const same = { status: 'working', note: 'Identical retry', revision: record.revision };
  const repeats = await Promise.all([store.update(1, same), store.update(1, same)]);
  assert.equal(repeats[0].revision, repeats[1].revision);
  record = await store.detail(1);assert.equal(record.revision, 2);assert.equal(record.history.length, 2);
  assert.equal((await createCloudStore(db, 'owner-b').list()).total, 0);
});

test('history write failure rolls back the admin mutation', async t => {
  const db = database(t), store = createCloudStore(db, 'owner-a');await store.save(randomUUID(), payload());
  const before = await store.detail(1);
  db.sqlite.exec("CREATE TRIGGER fail_history BEFORE INSERT ON inquiry_history BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
  const response = await call(db, '/api/admin/inquiries/1', { method: 'PATCH', body: { status: 'working', note: 'Must rollback', revision: 0 } });
  assert.equal(response.response.status, 503);assert.deepEqual(response.data, { error: 'storage_unavailable' });
  assert.deepEqual(await store.detail(1), before);
});

test('owner-scoped search, literal LIKE filters, pagination and new-first sorting', async t => {
  const db = database(t), store = createCloudStore(db, 'owner-a');
  for (let i = 0; i < 27; i++) await store.save(randomUUID(), payload());
  await createCloudStore(db, 'owner-b').save(randomUUID(), payload());
  await store.update(27, { status: 'closed', note: '', revision: 0 });
  const first = await store.list(), second = await store.list({ page: 2 });
  assert.equal(first.total, 27);assert.equal(first.items.length, 25);assert.equal(second.items.length, 2);assert.equal(first.items[0].recordId, 26);
  assert.equal(first.counts.closed, 1);assert.equal(first.counts.new, 26);
  assert.equal((await store.list({ q: 'КАЗАНЬ' })).total, 27);
  assert.equal((await store.list({ q: 'N:OW' })).total, 27);
  assert.equal((await store.list({ q: '%' })).total, 0);
  assert.equal((await store.list({ q: first.items[0].id })).total, 1);
  assert.equal((await store.list({ status: 'closed' })).total, 1);
  await assert.rejects(store.list({ page: 0 }), { code: 'invalid_filter' });
  await assert.rejects(store.list({ status: 'unknown' }), { code: 'invalid_status' });
});

async function workflowFixture(t) {
  const db = database(t), store = createCloudStore(db, 'owner-a');
  await store.save(randomUUID(), payload());
  let record = await store.detail(1);
  const edit = async (change, extra = {}) => {
    const workflow = structuredClone(record.workflow);change(workflow);
    record = await store.update(1, { status: 'working', note: record.note, revision: record.revision, workflow, ...extra });
    return record;
  };
  return { db, store, get record() { return record; }, edit };
}
async function confirmedBrief(f) {
  await f.edit(w => {
    for (const key of Object.keys(briefFields)) w.brief[key] = 'Уточнено: ' + key;
    w.brief.confirmationNote = 'Заказчик подтвердил по телефону';
  });
  assert.equal(briefConfirmed(f.record.workflow.brief), false);
  await f.edit(w => { w.brief.confirmed = true; });
}
async function interestedTeam(f) {
  await f.edit(w => { w.teams.push({ ...emptyTeam('n-ow'), response: 'interested', responseNote: 'Представитель агентства ответил сегодня', customerConsent: 'yes', customerConsentNote: 'Заказчик согласен', agencyConsent: 'yes', agencyConsentNote: 'Агентство согласно' }); });
}

test('workflow progresses from refined brief through introduction and conversation to closed outcome', async t => {
  const f = await workflowFixture(t), original = f.record.receipt;
  assert.equal((await f.store.list()).items[0].nextAction.stage, 'brief');
  await confirmedBrief(f);assert.equal(briefConfirmed(f.record.workflow.brief), true);
  assert.equal((await f.store.list()).items[0].nextAction.stage, 'selection');
  await interestedTeam(f);
  for (const key of ['response', 'customerConsent', 'agencyConsent']) assert.equal(evidenceCurrent(f.record.workflow.teams[0], f.record.workflow.brief, key), true);
  assert.equal((await f.store.list()).items[0].nextAction.stage, 'introduction');
  await f.edit(w => { w.teams[0].contactsShared = true;w.teams[0].contactNote = 'Обе стороны получили контакты'; });
  const sharedAt = f.record.workflow.teams[0].sharedAt;
  assert(sharedAt);assert.equal(f.record.workflow.teams[0].sharedBriefVersion, f.record.workflow.brief.version);
  assert.equal((await f.store.list()).items[0].nextAction.stage, 'outcome');
  await f.edit(w => { w.teams[0].conversationHeld = true;w.teams[0].conversationNote = 'Обсудили площадку';w.teams[0].nextStep = 'Получить предложение завтра'; });
  assert(f.record.workflow.teams[0].conversationAt);assert.equal(f.record.workflow.teams[0].sharedAt, sharedAt);
  await f.edit(w => { w.teams[0].result = 'Обсуждение завершено'; }, { status: 'closed', closureReason: 'Результат записан' });
  assert.equal((await f.store.list()).items[0].nextAction.closed, true);
  assert.deepEqual(f.record.receipt, original);
  assert.deepEqual(f.record.history[0].details.workflow, f.record.workflow);
  assert(f.record.history[0].details.changes.includes('workflow'));
  assert.deepEqual((await createCloudStore(f.db, 'owner-a').detail(1)).workflow, f.record.workflow);
});

test('changed brief invalidates confirmation and prior evidence; explicit renewal enables introduction', async t => {
  const f = await workflowFixture(t);await confirmedBrief(f);await interestedTeam(f);
  const oldVersion = f.record.workflow.brief.version;
  await f.edit(() => {}, { replyText: 'Согласованные условия', replyBasis: await digest(replyKey(f.record.recommendations, f.record.workflow.brief, f.record.workflow.teams)) });
  assert.equal(f.record.replyStale, false);
  await f.edit(w => { w.brief.budget = 'Новый бюджет';w.brief.version = 999;w.brief.confirmedVersion = 999; });
  assert.equal(f.record.workflow.brief.version, oldVersion + 1);assert.equal(briefConfirmed(f.record.workflow.brief), false);assert.equal(f.record.replyStale, true);
  await f.edit(w => { w.brief.confirmed = true; });
  assert.equal(evidenceCurrent(f.record.workflow.teams[0], f.record.workflow.brief, 'response'), false);
  await assert.rejects(f.edit(w => { w.teams[0].contactsShared = true;w.teams[0].contactNote = 'Попытка со старыми согласиями'; }), { code: 'introduction_not_ready' });
  await f.edit(w => { w.teams[0].reconfirm = { response: true, customerConsent: true, agencyConsent: true }; });
  await f.edit(w => { w.teams[0].contactsShared = true;w.teams[0].contactNote = 'Передано по новому брифу'; });
  assert.equal(f.record.workflow.teams[0].sharedBriefVersion, oldVersion + 1);
  const event = structuredClone(f.record.workflow.teams[0]);
  await f.edit(w => { w.brief.city = 'Другой город'; });
  assert.equal(f.record.workflow.teams[0].contactsShared, true);assert.equal(f.record.workflow.teams[0].sharedAt, event.sharedAt);
  assert.equal(f.record.workflow.teams[0].sharedBriefVersion, event.sharedBriefVersion);
});

test('workflow validations preserve team history and recorded events', async t => {
  const f = await workflowFixture(t);
  await assert.rejects(f.edit(w => { w.brief.confirmed = true; }), { code: 'brief_confirmation_required' });
  await confirmedBrief(f);await interestedTeam(f);
  for (const [mutate, code] of [
    [w => { w.teams = []; }, 'keep_team_history'],
    [w => { w.teams.push({ ...w.teams[0] }); }, 'invalid_workflow'],
    [w => { w.teams[0].response = 'declined';w.teams[0].refusalReason = ''; }, 'refusal_reason_required'],
    [w => { w.teams[0].responseNote = ''; }, 'response_note_required'],
    [w => { w.teams[0].customerConsentNote = ''; }, 'consent_note_required'],
    [w => { w.teams[0].conversationHeld = true; }, 'conversation_incomplete'],
  ]) await assert.rejects(f.edit(mutate), { code });
  await f.edit(w => { w.teams[0].contactsShared = true;w.teams[0].contactNote = 'Передано'; });
  await assert.rejects(f.edit(w => { w.teams[0].contactsShared = false; }), { code: 'keep_recorded_events' });
  await f.edit(w => { w.teams[0].conversationHeld = true;w.teams[0].conversationNote = 'Разговор';w.teams[0].nextStep = 'Следующий шаг'; });
  await assert.rejects(f.edit(w => { w.teams[0].conversationHeld = false; }), { code: 'keep_recorded_events' });
});

test('workflow-only writes enforce owner and optimistic revision, with atomic history rollback', async t => {
  const f = await workflowFixture(t), base = f.record;
  const first = structuredClone(base.workflow), second = structuredClone(base.workflow);
  first.brief.goal = 'Цель A';second.brief.goal = 'Цель B';
  const input = workflow => ({ status: 'working', note: '', revision: 0, workflow });
  const results = await Promise.allSettled([f.store.update(1, input(first)), f.store.update(1, input(second))]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);assert.equal(results.find(r => r.status === 'rejected').reason.code, 'revision_conflict');
  const saved = await f.store.detail(1);assert.equal(saved.revision, 1);assert.equal(saved.history.length, 1);
  assert.deepEqual(saved.history[0].details.workflow, saved.workflow);
  await assert.rejects(createCloudStore(f.db, 'owner-b').update(1, input(first)), { code: 'not_found' });
  assert.equal((await createCloudStore(f.db, 'owner-b').list()).total, 0);
  f.db.sqlite.exec("CREATE TRIGGER fail_workflow_history BEFORE INSERT ON inquiry_history BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
  await assert.rejects(f.store.update(1, { ...input(second), revision: saved.revision, workflow: { ...saved.workflow, brief: { ...saved.workflow.brief, goal: 'Must rollback' } } }));
  assert.deepEqual(await f.store.detail(1), saved);
});

test('identical workflow retry is a no-op and identical concurrent updates create one history event', async t => {
  const f = await workflowFixture(t), workflow = structuredClone(f.record.workflow);
  workflow.teams.push(emptyTeam('n-ow'));
  const input = { status: 'working', note: '', revision: 0, workflow };
  const results = await Promise.all([f.store.update(1, input), f.store.update(1, input)]);
  assert.equal(results[0].revision, 1);assert.equal(results[1].revision, 1);
  const retry = await f.store.update(1, input);assert.equal(retry.revision, 1);assert.equal(retry.history.length, 1);
});

test('full workflow history remains available past 100 changes', async t => {
  const f = await workflowFixture(t);
  for (let index = 0; index < 105; index++) await f.edit(w => { w.brief.goal = 'Цель ' + index; });
  const saved = await f.store.detail(1);assert.equal(saved.history.length, 105);
  assert.equal(saved.history.at(-1).details.workflow.brief.goal, 'Цель 0');
  assert.equal(saved.history[0].details.workflow.brief.goal, 'Цель 104');
});

test('new migration preserves prior receipt, metadata, retry key and old history verbatim', async t => {
  const db = database(t, 1), key = randomUUID(), store = createCloudStore(db, 'owner-a');
  const original = await store.save(key, payload());
  db.sqlite.prepare('UPDATE inquiries SET note=?,reply_text=?,reply_basis=?,revision=1 WHERE id=1').run('Старая заметка', 'Старый ответ', await digest(recommendationKey([])));
  const oldDetails = JSON.stringify({ changes: ['note'], recommendations: [], replyText: 'Старый ответ' });
  db.sqlite.prepare("INSERT INTO inquiry_history(inquiry_id,owner_id,revision,created_at,actor,status,note,details_json) VALUES(1,'owner-a',1,?,'admin','new',?,?)").run(original.receipt.createdAt, 'Старая заметка', oldDetails);
  const before = db.sqlite.prepare('SELECT * FROM inquiries WHERE id=1').get();
  const directory = new URL('../drizzle/', import.meta.url);
  for (const name of fs.readdirSync(directory).filter(n => n.endsWith('.sql')).sort().slice(1)) db.sqlite.exec(fs.readFileSync(new URL(name, directory), 'utf8'));
  const { workflow_json, ...after } = db.sqlite.prepare('SELECT * FROM inquiries WHERE id=1').get();
  assert.equal(workflow_json, '{}');assert.deepEqual(after, { ...before });
  const record = await store.detail(1);assert.deepEqual(record.receipt, original.receipt);assert.equal(record.note, 'Старая заметка');
  assert.equal(record.workflow.brief.city, original.receipt.brief.city);assert.equal(record.workflow.brief.date, 'Дата пока неизвестна');
  assert.equal(record.workflow.brief.version, 1);assert.equal(record.workflow.brief.confirmed, false);assert.deepEqual(record.workflow.teams, []);
  assert.equal(record.replyStale, true, 'Legacy reply basis must not certify the newly introduced workflow');
  assert.equal(db.sqlite.prepare('SELECT details_json FROM inquiry_history WHERE id=1').get().details_json, oldDetails);
  assert.equal((await store.save(key, payload())).duplicate, true);
  assert.equal((await store.list()).items[0].nextAction.stage, 'brief');
});
