// Локальный сервер для разработки: раздаёт public/ и запускает функции из api/
// так же, как это делает Vercel.  Запуск:  node dev-server.mjs  (порт 5173)
// Переменные окружения можно положить в файл .env рядом (BOT_TOKEN=..., ADMIN_CHAT_ID=...).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 5173);

// .env
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
};

async function runApi(name, req, res, url) {
  const file = path.join(ROOT, 'api', name + '.js');
  if (!/^[a-z0-9-]+$/i.test(name) || !fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: 'not found' }));
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    req.body = req.headers['content-type']?.includes('application/json') && raw ? JSON.parse(raw) : raw;
  } catch {
    req.body = raw;
  }
  req.query = Object.fromEntries(url.searchParams);
  const mod = await import(pathToFileURL(file).href + '?t=' + Date.now());
  try {
    await mod.default(req, res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500);
    res.end('error');
  }
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const started = Date.now();
    res.on('finish', () => console.log(`${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - started}ms`));
    if (url.pathname.startsWith('/api/')) return runApi(url.pathname.slice(5).replace(/\/$/, ''), req, res, url);

    let p = decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.normalize(path.join(PUBLIC, p));
    if (!file.startsWith(PUBLIC)) {
      res.writeHead(403);
      return res.end();
    }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Not found');
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      fs.createReadStream(file).pipe(res);
    });
  })
  .listen(PORT, () => console.log(`Отпуск: http://localhost:${PORT}`));
