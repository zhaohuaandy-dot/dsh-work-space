// 入口：静态文件 + /api 路由。默认 http://127.0.0.1:3000
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dispatch, ApiError } from './api.mjs';
import { seed } from './seed.mjs';
import { isUserDataMode } from './importer.mjs';
import { getDb } from './db.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PUBLIC = join(ROOT, 'web');
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
const MAX_BODY = 1024 * 1024;

async function readBody(req) {
  const chunks = [];
  let len = 0;
  for await (const chunk of req) {
    len += chunk.length;
    if (len > MAX_BODY) throw new ApiError(413, '请求体过大');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, '请求体不是合法 JSON');
  }
}

async function handleApi(req, res, url) {
  const route = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const q = Object.fromEntries(url.searchParams);
  const send = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  try {
    const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req);
    const r = dispatch(route, req.method, q, body);
    send(r.status, r.body);
  } catch (e) {
    if (e instanceof ApiError) return send(e.status, { error: e.message });
    console.error('[api]', req.method, url.pathname, e);
    send(500, { error: '服务器内部错误' });
  }
}

async function handleStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = normalize(join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404 Not Found');
  }
}

export function createApp() {
  return createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname.startsWith('/api')) handleApi(req, res, url);
    else handleStatic(req, res, url);
  });
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('index.mjs')) {
  // 首次启动灌入演示数据；用户清空并录入自己的数据后（cleared_at 标记）不再自动灌回
  if (!isUserDataMode(getDb())) seed();
  createApp().listen(PORT, HOST, () => {
    console.log(`外贸客户管理系统已启动: http://${HOST}:${PORT}`);
  });
}
