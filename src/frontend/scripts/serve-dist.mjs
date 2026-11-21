import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
const root = resolve('dist');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2' };
createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const relative = pathname.slice(1) || 'index.html';
  let file = resolve(root, relative);
  if (!file.startsWith(root + sep)) { response.writeHead(404).end(); return; }
  if (pathname.startsWith('/api/')) { response.writeHead(404, { 'Content-Type': 'application/json' }).end('{}'); return; }
  let data;
  try { data = await readFile(file); } catch { if (extname(relative)) { response.writeHead(404).end(); return; } file = resolve(root, 'index.html'); data = await readFile(file); }
  response.writeHead(200, {
    'Content-Type': types[extname(file)] || 'application/octet-stream',
    'Cache-Control': relative.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  }).end(data);
}).listen(Number(process.env.PORT || 4173), '0.0.0.0', () => console.log('WorkGetsDone bundle preview on http://localhost:4173'));
