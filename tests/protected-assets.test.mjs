import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { packProtectedAssets } from '../scripts/protected-assets.mjs';
import { serveProtectedAsset } from '../cloud/protected-assets.mjs';
import { authorizeSite } from '../cloud/guest-access.mjs';

test('protected pages and administrator code leave the public asset directory intact only as server content', async t => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'ea-protected-'));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const directory = path.join(folder, 'static'), generated = path.join(folder, 'bundle.mjs');
  await fs.mkdir(path.join(directory, 'admin'), { recursive: true });
  for (const [name, body] of [['index.html', '<h1>Главная</h1>'], ['admin/index.html', '<h1>Админка</h1>'], ['admin/app.js', 'const sample = true;'], ['admin/app.css', 'body{color:#fff}'], ['photo.webp', 'public-media']]) await fs.writeFile(path.join(directory, name), body);
  assert.equal(await packProtectedAssets(directory, generated), 4);
  for (const name of ['index.html', 'admin/index.html', 'admin/app.js', 'admin/app.css']) await assert.rejects(fs.access(path.join(directory, name)));
  assert.equal(await fs.readFile(path.join(directory, 'photo.webp'), 'utf8'), 'public-media');
  const files = (await import(pathToFileURL(generated))).default;
  for (const route of ['/', '/index.html']) assert.equal(await serveProtectedAsset(new Request('https://ea.test' + route), files).text(), '<h1>Главная</h1>');
  for (const route of ['/admin', '/admin/', '/admin/index.html', '/%61dmin']) {
    const req = new Request('https://ea.test' + route);
    assert.equal((await authorizeSite(req, {})).response.status, 403);
    const response = serveProtectedAsset(req, files);
    assert.equal(await response.text(), '<h1>Админка</h1>');
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.match(response.headers.get('content-type'), /text\/html/);
  }
  assert.match(serveProtectedAsset(new Request('https://ea.test/admin/app.js'), files).headers.get('content-type'), /javascript/);
  assert.equal(await serveProtectedAsset(new Request('https://ea.test/admin', { method: 'HEAD' }), files).text(), '');
  assert.equal(serveProtectedAsset(new Request('https://ea.test/missing'), files), null);
});
