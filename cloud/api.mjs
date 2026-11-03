import { createCloudStore, digest, problem } from './store.mjs';
import { createProjectCopyStore } from './project-copies.mjs';

const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' };
const reply = (status, data) => new Response(JSON.stringify(data), { status, headers });
export const csrfFor = (ownerId, origin) => digest(JSON.stringify(['eventagencies-cloud-csrf-v1', ownerId, origin]));

async function readBody(request, limit) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) throw problem(415, 'json_required');
  if (Number(request.headers.get('content-length')) > limit) throw problem(413, 'too_large');
  const reader = request.body?.getReader();
  if (!reader) throw problem(400, 'invalid_json');
  const chunks = []; let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); throw problem(413, 'too_large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw problem(400, 'invalid_json'); }
}

export async function handleCloudApi(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return null;
  // This header is supplied by Sites' authenticated gateway, never by app login.
  const ownerId = request.headers.get('oai-authenticated-user-id');
  if (!ownerId?.trim()) return reply(401, { error: 'authentication_required' });
  try {
    const mutation = !['GET', 'HEAD'].includes(request.method);
    if (request.headers.get('sec-fetch-site') === 'cross-site' || (request.headers.has('origin') && request.headers.get('origin') !== url.origin) || (mutation && request.headers.get('origin') !== url.origin)) throw problem(403, 'forbidden_origin');
    const isAdmin = url.pathname.startsWith('/api/admin/');
    const csrf = isAdmin ? await csrfFor(ownerId, url.origin) : null;
    if (isAdmin && mutation && request.headers.get('x-csrf-token') !== csrf) throw problem(403, 'csrf_required');
    if (url.pathname === '/api/health' && request.method === 'GET') return reply(200, { service: 'eventagencies-cloud-inquiries', storage: 'd1', notifications: false });
    if (url.pathname === '/api/admin/session' && request.method === 'GET') return reply(200, { authenticated: true, username: 'Владелец', csrf });
    if (url.pathname === '/api/admin/logout' && request.method === 'POST') return reply(200, { ok: true, signOutUrl: '/signout-with-chatgpt?return_to=/admin' });
    if (url.pathname === '/api/admin/login') return reply(405, { error: 'sign_in_with_chatgpt_required' });
    if (url.pathname === '/api/project-copies') {
      const copies = createProjectCopyStore(env.DB, ownerId);
      if (request.method === 'GET') return reply(200, await copies.list({ page: Number(url.searchParams.get('page') || 1) }));
      if (request.method === 'POST') {
        const result = await copies.save(await readBody(request, 1048576));
        return reply(result.duplicate ? 200 : 201, { ok: true, ...result });
      }
      return reply(405, { error: 'method_not_allowed' });
    }
    const copyMatch = /^\/api\/project-copies\/([1-9]\d*)$/.exec(url.pathname);
    if (copyMatch) {
      const copies = createProjectCopyStore(env.DB, ownerId), id = Number(copyMatch[1]);
      if (request.method === 'GET') return reply(200, await copies.detail(id));
      if (request.method === 'DELETE') return reply(200, await copies.remove(id));
      return reply(405, { error: 'method_not_allowed' });
    }
    const store = createCloudStore(env.DB, ownerId);
    if (url.pathname === '/api/inquiries') {
      if (request.method === 'GET') return reply(200, await store.customerHistory({ page: Number(url.searchParams.get('page') || 1), q: url.searchParams.get('q') || '', status: url.searchParams.get('status') || '' }));
      if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
      const input = await readBody(request, 32768), result = await store.save(input?.requestId, input?.payload);
      return reply(result.duplicate ? 200 : 201, { ok: true, ...result });
    }
    const customerMatch = /^\/api\/inquiries\/([1-9]\d*)$/.exec(url.pathname);
    if (customerMatch) {
      if (request.method !== 'GET') return reply(405, { error: 'method_not_allowed' });
      return reply(200, await store.customerReceipt(Number(customerMatch[1])));
    }
    if (url.pathname === '/api/admin/catalog' && request.method === 'GET') return reply(200, store.catalog());
    if (url.pathname === '/api/admin/inquiries' && request.method === 'GET') return reply(200, await store.list({ q: url.searchParams.get('q') || '', status: url.searchParams.get('status') || '', page: Number(url.searchParams.get('page') || 1) }));
    const match = /^\/api\/admin\/inquiries\/([1-9]\d*)$/.exec(url.pathname);
    if (match && request.method === 'GET') return reply(200, await store.detail(Number(match[1])));
    if (match && request.method === 'PATCH') return reply(200, await store.update(Number(match[1]), await readBody(request, 131072)));
    return reply(404, { error: 'not_found' });
  } catch (error) {
    return reply(error.status || 503, { error: error.status ? error.code : 'storage_unavailable' });
  }
}
