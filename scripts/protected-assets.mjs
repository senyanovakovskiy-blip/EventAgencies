import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8' };

// The hosted asset gateway may serve matching files before invoking the Worker,
// regardless of local Wrangler's run_worker_first. Put protected pages and code
// inside the Worker bundle, not the publicly served asset directory. Photographs
// and fonts remain static media; they contain no customer or administrator data.
export async function packProtectedAssets(directory, output) {
  const files = {};
  async function visit(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) { await visit(absolute); continue; }
      const type = types[path.extname(entry.name)];
      if (!type) continue;
      const route = '/' + path.relative(directory, absolute).split(path.sep).join('/');
      files[route] = [type, gzipSync(await fs.readFile(absolute), { level: 9 }).toString('base64')];
      await fs.unlink(absolute);
    }
  }
  await visit(directory);
  if (!files['/index.html'] || !files['/admin/index.html']) throw Error('Protected page build is incomplete');
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, 'export default ' + JSON.stringify(files) + ';\n');
  return Object.keys(files).length;
}
