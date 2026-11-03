// 生成界面截图（用于文档与 PR 的前后对比）
// 用法：node scripts/capture.mjs [baseUrl] [输出目录]
// 用 BROWSER 环境变量指定 Chrome / Edge 可执行文件；默认自动探测常见路径。
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3000';
const OUT = process.argv[3] ?? 'docs/screenshots';
const PAGES = [
  ['dashboard', '/#/dashboard'],
  ['customers', '/#/customers'],
  ['customer-detail', '/#/customers/1'],
  ['sea', '/#/sea'],
  ['customs', '/#/customs'],
  ['opportunities', '/#/opportunities'],
  ['trade-quotations', '/#/trade'],
  ['trade-orders', '/#/trade?tab=orders'],
  ['activities', '/#/activities'],
  ['templates', '/#/templates'],
];

const CANDIDATES = [
  process.env.BROWSER,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const EDGE = CANDIDATES.find((p) => existsSync(p));
if (!EDGE) {
  console.error('未找到 Chrome / Edge，请用 BROWSER 环境变量指定可执行文件路径。');
  process.exit(1);
}

const port = 9550 + Math.floor(Math.random() * 40);
const width = 1440;
const height = 1000;
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--disable-extensions',
  `--remote-debugging-port=${port}`, `--window-size=${width},${height}`,
  '--user-data-dir=' + (process.env.TEMP ?? '/tmp') + '/dsh-capture-' + port, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function wsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* wait */ }
    await sleep(200);
  }
  throw new Error('devtools unavailable');
}
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pending = new Map();
    let id = 0;
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const { res, rej } = pending.get(m.id);
        pending.delete(m.id);
        if (m.error) rej(new Error(JSON.stringify(m.error))); else res(m.result);
      }
    });
    ws.addEventListener('error', reject);
    ws.addEventListener('open', () => resolve({
      send: (method, params = {}) => new Promise((res, rej) => {
        const mid = ++id;
        pending.set(mid, { res, rej });
        ws.send(JSON.stringify({ id: mid, method, params }));
      }),
      close: () => ws.close(),
    }));
  });
}

mkdirSync(OUT, { recursive: true });
let c;
try {
  c = await connect(await wsUrl());
  await c.send('Page.enable');
  await c.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  for (const [name, path] of PAGES) {
    await c.send('Page.navigate', { url: BASE + path });
    await sleep(2000);
    const shot = await c.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, clip: { x: 0, y: 0, width, height, scale: 1 } });
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(shot.data, 'base64'));
    console.log('captured', name);
  }
} catch (e) {
  console.error('capture failed:', e.message);
  process.exitCode = 1;
} finally {
  c?.close();
  child.kill();
}
