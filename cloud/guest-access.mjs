// A bounded invitation capability, independent of the owner's Sites sign-in.
// Only its SHA-256 hash and expiry are stored in the hosted environment.
import { isAdministrator } from './admin-access.mjs';

export const invitationCookie = '__Host-ea-invitation';
const tokenPattern = /^[a-f0-9]{64}$/;
const secureHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

export async function invitationDigest(token) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map(value => value.toString(16).padStart(2, '0')).join('');
}

function configuration(env, now) {
  const hash = env?.EA_INVITATION_HASH;
  const expires = Date.parse(env?.EA_INVITATION_EXPIRES || '');
  return tokenPattern.test(hash || '') && Number.isFinite(expires) && expires > now ? { hash, expires } : null;
}

async function accepts(token, config) {
  if (!config || typeof token !== 'string' || !tokenPattern.test(token)) return false;
  const actual = await invitationDigest(token);
  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual.charCodeAt(i) ^ config.hash.charCodeAt(i);
  return difference === 0;
}

function cookieToken(request) {
  const matches = (request.headers.get('cookie') || '').split(';').map(part => part.trim()).filter(part => part.startsWith(invitationCookie + '='));
  // Reject ambiguous cookies instead of choosing an attacker-controlled duplicate.
  return matches.length === 1 ? matches[0].slice(invitationCookie.length + 1) : '';
}

export function clearInvitationCookie() {
  return `${invitationCookie}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...secureHeaders, 'Content-Type': 'application/json; charset=utf-8', ...extra } });
}

async function readToken(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) return null;
  if (Number(request.headers.get('content-length')) > 512 || !request.body) return null;
  const reader = request.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 512) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder().decode(bytes))?.token;
  } catch { return null; }
  finally { reader.releaseLock(); }
}

function entrancePage(request, invitation = false) {
  const nonce = crypto.randomUUID().replaceAll('-', '');
  const script = invitation ? `<script nonce="${nonce}">
    (async()=>{
      const token=location.hash.slice(1);
      history.replaceState(null,'','/invite');
      const status=document.getElementById('status');
      if(!/^[a-f0-9]{64}$/.test(token)){status.textContent='Откройте полную ссылку-приглашение, которую вам передал владелец.';return;}
      status.textContent='Открываем ваше рабочее пространство…';
      try{
        const response=await fetch('/api/access/redeem',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
        if(!response.ok){status.textContent='Ссылка недействительна или срок доступа истёк. Попросите владельца прислать новую.';return;}
        location.replace('/');
      }catch{status.textContent='Не удалось подключиться. Откройте приглашение ещё раз, когда появится интернет.';}
    })();
  </script>` : '';
  const body = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Вход — EventAgencies</title><style nonce="${nonce}">*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:28px;background:#101817;color:#f3f4ed;font:16px/1.65 system-ui,sans-serif}main{width:100%;max-width:520px;border-top:1px solid #658e7c;padding:28px 0}small{color:#a5c6b3;letter-spacing:.12em}h1{font-size:clamp(30px,7vw,44px);font-weight:500;line-height:1.15;margin:28px 0 20px}p{color:#c1ccc4}a{display:inline-block;margin-top:20px;padding:12px 18px;border:1px solid #658e7c;border-radius:6px;color:#f3f4ed;text-decoration:none}a:focus-visible{outline:3px solid #a5c6b3;outline-offset:4px}</style></head><body><main><small>EVENTAGENCIES</small><h1>${invitation ? 'Ваше приглашение' : 'Закрытое рабочее пространство'}</h1><p id="status" role="status">${invitation ? 'Подготавливаем вход…' : 'Для доступа откройте секретную ссылку, которую вам передал владелец.'}</p><noscript><p>Для входа по приглашению включите JavaScript в браузере.</p></noscript><a href="/signin-with-chatgpt?return_to=/" target="_top">Вход владельца</a></main>${script}</body></html>`;
  return new Response(request.method === 'HEAD' ? null : body, { status: invitation ? 200 : 403, headers: {
    ...secureHeaders,
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
  } });
}

// Runs before every asset and API request, even when the platform gateway allows
// anonymous browsers. No query parameter or client-supplied role grants access.
export async function authorizeSite(request, env, now = Date.now()) {
  const url = new URL(request.url);
  const config = configuration(env, now);
  if (url.pathname === '/api/access/redeem') {
    if (request.method !== 'POST') return { response: json(405, { error: 'method_not_allowed' }) };
    if (request.headers.get('origin') !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site') return { response: json(403, { error: 'forbidden_origin' }) };
    const token = await readToken(request);
    if (!await accepts(token, config)) return { response: json(403, { error: 'invitation_invalid' }) };
    const maxAge = Math.max(0, Math.floor((config.expires - now) / 1000));
    return { response: json(200, { ok: true }, { 'Set-Cookie': `${invitationCookie}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}` }) };
  }
  if (url.pathname === '/invite' && ['GET', 'HEAD'].includes(request.method)) return { response: entrancePage(request, true) };
  // Existing owner identity always wins, including when they inspect an invite.
  if (isAdministrator(request, env)) return { access: null };
  if (await accepts(cookieToken(request), config)) return { access: {
    kind: 'invitation', admin: true, ownerId: 'invitation:' + config.hash, expiresAt: new Date(config.expires).toISOString(),
  } };
  if (url.pathname.startsWith('/api/')) return { response: json(401, { error: 'authentication_required' }) };
  return { response: entrancePage(request) };
}
