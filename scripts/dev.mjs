// Local dev server that mimics the Vercel deployment:
//   public/ as static files, api/*.js as functions, /s/:id → api/view,
// with sharing stored on disk in .data/ instead of Vercel Blob.
//   npm run dev  →  http://localhost:4400
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, '.data');
process.env.PULSE_LOCAL_STORAGE ||= DATA;
process.env.PULSE_DEV_AUTH ||= '1'; // fake sign-in for local testing ("Bearer dev:<name>")
const PORT = +process.env.PORT || 4400;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.wasm': 'application/wasm',
};

async function sendFile(req, res, file) {
  const st = await stat(file).catch(() => null);
  if (!st || !st.isFile()) { res.writeHead(404).end('Not found'); return; }
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (range) {
    const start = range[1] ? +range[1] : 0;
    const end = range[2] ? +range[2] : st.size - 1;
    res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${start}-${end}/${st.size}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1 });
    createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'content-type': type, 'content-length': st.size, 'accept-ranges': 'bytes' });
    createReadStream(file).pipe(res);
  }
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

async function callApi(name, req, res, url) {
  const mod = await import(path.join(ROOT, 'api', `${name}.js`)).catch(() => null);
  const fn = mod && mod[req.method];
  if (!fn) { res.writeHead(mod ? 405 : 404).end(); return; }
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req);
  const request = new Request(url, { method: req.method, headers: req.headers, body });
  const response = await fn(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const p = decodeURIComponent(url.pathname);
    if (p === '/api/config') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ storage: 'local', auth: { mode: 'dev' } }));
    } else if (p === '/api/dev-upload' && req.method === 'PUT') {
      const pathname = url.searchParams.get('pathname') || '';
      if (!/^media\/(img|audio)\/[\w.-]+$/.test(pathname)) { res.writeHead(400).end(); return; }
      const named = pathname.replace(/(\.[\w]+)$/, `-${randomBytes(4).toString('hex')}$1`);
      await mkdir(path.dirname(path.join(DATA, named)), { recursive: true });
      await writeFile(path.join(DATA, named), await readBody(req));
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ url: `/m/${named}`, pathname: named }));
    } else if (p.startsWith('/api/')) {
      await callApi(p.slice(5).replace(/\/$/, ''), req, res, url);
    } else if (/^\/s\/[A-Za-z0-9]+$/.test(p)) {
      url.searchParams.set('id', p.slice(3));
      await callApi('view', req, res, new URL(`/api/view?${url.searchParams}`, url));
    } else if (p.startsWith('/m/')) {
      await sendFile(req, res, path.join(DATA, path.normalize(p.slice(3)).replace(/^(\.\.[/\\])+/, '')));
    } else {
      const rel = path.normalize(p).replace(/^(\.\.[/\\])+/, '');
      await sendFile(req, res, path.join(PUBLIC, rel.endsWith('/') ? rel + 'index.html' : rel));
    }
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500);
    res.end('Server error');
  }
}).listen(PORT, () => console.log(`Pulse dev server: http://localhost:${PORT}`));
