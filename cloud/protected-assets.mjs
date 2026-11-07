// Called only after authorizeSite and the route-level admin check.
export function serveProtectedAsset(request, files) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url).pathname); }
  catch { return new Response('Invalid path', { status: 400 }); }
  if (pathname.includes('\\')) return new Response('Invalid path', { status: 400 });
  const normalized = pathname === '/' ? '/index.html' : pathname.replace(/\/$/, '');
  const file = files[normalized] || files[normalized + '/index.html'];
  if (!Array.isArray(file)) return null;
  const [type, encoded] = file;
  const body = request.method === 'HEAD' ? null : new Blob([Uint8Array.from(atob(encoded), value => value.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(body, { headers: {
    'Content-Type': type,
    'Cache-Control': 'private, no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  } });
}
