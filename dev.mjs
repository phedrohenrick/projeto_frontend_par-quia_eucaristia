// Servidor local para testar o site: `npm run dev` e abra http://localhost:3000
// (na Vercel isso não é usado; lá a pasta api/ vira função automaticamente).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from './api/photos.js';

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const root = fileURLToPath(new URL('.', import.meta.url));

createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (path === '/api/photos') {
    const wrap = { status: (c) => ((res.statusCode = c), wrap), setHeader: (k, v) => res.setHeader(k, v),
      json: (b) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(b)); } };
    return handler(req, wrap);
  }
  const file = normalize(join(root, path === '/' ? 'index.html' : path));
  if (!file.startsWith(root) || /\/\.env/.test(file)) { res.statusCode = 404; return res.end(); }
  try {
    res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end('404'); }
}).listen(3000, () => console.log('Site em http://localhost:3000'));
