// Minimal static file server for local development: `npm start` -> http://localhost:2027
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT) || 2027; // not 5173: Vite and friends already use that

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    let file = join(root, normalize(decodeURIComponent(pathname)));
    if (!file.startsWith(root)) throw Object.assign(new Error('forbidden'), { code: 'EACCES' });
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    // No caching: edits to the data file or modules show up on a plain reload.
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch (err) {
    res.writeHead(err.code === 'ENOENT' ? 404 : 403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(err.code === 'ENOENT' ? 'Hittades inte' : 'Förbjudet');
  }
}).listen(port, '127.0.0.1', () => console.log(`Frankrike 2027 på http://localhost:${port}`));
