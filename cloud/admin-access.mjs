// Sites supplies both identity headers. The account allowlist is configured only
// in the hosted runtime; neither a client flag nor a Site account-user ID grants access.
export function isAdministrator(request, env, access = null) {
  if (access?.kind === 'invitation' && access.admin === true) return true;
  const identity = request.headers.get('oai-authenticated-user-id')?.trim();
  const email = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  const allowed = typeof env?.EA_ADMIN_EMAIL === 'string' ? env.EA_ADMIN_EMAIL.trim().toLowerCase() : '';
  return Boolean(identity && email && /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(allowed) && email === allowed);
}

export function protectAdminPage(request, env, access = null) {
  const url = new URL(request.url);
  const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' };
  // The asset server decodes URL paths. Apply the guard to that same path so
  // encoded characters or slashes cannot bypass protection of HTML and scripts.
  let decoded;
  try { decoded = decodeURIComponent(url.pathname).replaceAll('\\', '/'); }
  catch { return new Response(null, { status: 400, headers }); }
  const segments = [];
  for (const segment of decoded.split('/')) {
    if (segment === '..') segments.pop();
    else if (segment && segment !== '.') segments.push(segment);
  }
  const pathname = '/' + segments.join('/');
  if (pathname !== '/admin' && !pathname.startsWith('/admin/')) return null;
  if (isAdministrator(request, env, access)) return null;
  if (!request.headers.get('oai-authenticated-user-id')?.trim()) {
    return new Response(null, { status: 302, headers: { ...headers, Location: url.origin + '/signin-with-chatgpt?return_to=/admin' } });
  }
  const body = '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Доступ к админке — EventAgencies 101</title><body><main><h1>Это рабочее пространство администратора</h1><p>У вашего аккаунта нет доступа к обработке заявок. Свой проект и обращения можно открыть в разделе «Мой проект».</p><p><a href="/my-project">Открыть мой проект</a></p><p><a href="/">На главную</a> · <a href="/signout-with-chatgpt?return_to=/admin" target="_top">Войти в другой аккаунт</a></p></main></body></html>';
  return new Response(request.method === 'HEAD' ? null : body, { status: 403, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'" } });
}
