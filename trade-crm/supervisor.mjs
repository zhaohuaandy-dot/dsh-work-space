// 常驻守护进程：启动 server/index.mjs，异常退出后自动重启，并把日志写入 logs/。
// 由 Windows「启动」文件夹的 TradeCRM.vbs 静默拉起（开机/登录即运行）。
//
// 单实例：启动前先探测端口，若已有健康的 trade-crm 在跑就直接退出，避免重复拉起。
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, statSync, renameSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4317);
const HOST = process.env.HOST ?? '127.0.0.1';
const LOG_DIR = join(ROOT, 'logs');
const LOG = join(LOG_DIR, 'server.log');
const LOCK = join(LOG_DIR, 'supervisor.pid');
mkdirSync(LOG_DIR, { recursive: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { appendFileSync(LOG, line); } catch { /* ignore */ }
  process.stdout.write(line);
}

// 日志超过 5MB 时轮转一次，避免长期运行无限增长
function rotate() {
  try {
    if (statSync(LOG).size > 5 * 1024 * 1024) renameSync(LOG, `${LOG}.1`);
  } catch { /* 文件还不存在 */ }
}

async function alreadyRunning() {
  try {
    const res = await fetch(`http://${HOST}:${PORT}/api/ping`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return false;
    const body = await res.json();
    return body?.ok === true;
  } catch {
    return false;
  }
}

// 写入 PID 锁；若锁文件里的进程仍在运行则放弃启动
function acquireLock() {
  try {
    const pid = Number(readFileSync(LOCK, 'utf8').trim());
    if (pid && pid !== process.pid) {
      process.kill(pid, 0); // 不发送信号，仅检测存活；进程存在则抛错
      log(`已有守护进程在运行（pid ${pid}），本次启动退出`);
      return false;
    }
  } catch (e) {
    if (e.code === 'EPERM') return false; // 进程存在但无权限，视为已在运行
  }
  writeFileSync(LOCK, String(process.pid), 'utf8');
  return true;
}

function releaseLock() {
  try {
    const pid = Number(readFileSync(LOCK, 'utf8').trim());
    if (pid === process.pid) writeFileSync(LOCK, '', 'utf8');
  } catch { /* ignore */ }
}

if (!acquireLock()) process.exit(0);
if (await alreadyRunning()) {
  log(`端口 ${PORT} 上已有 trade-crm 在运行，本次启动退出`);
  releaseLock();
  process.exit(0);
}

let child = null;
let stopping = false;
let restarts = 0;

function start() {
  rotate();
  log(`启动 trade-crm http://${HOST}:${PORT}`);
  child = spawn(process.execPath, [join(ROOT, 'server', 'index.mjs')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), HOST },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.on('data', (d) => log(`[server] ${String(d).trimEnd()}`));
  child.stderr.on('data', (d) => log(`[server:err] ${String(d).trimEnd()}`));
  child.on('exit', (code, signal) => {
    log(`进程退出 code=${code} signal=${signal ?? '-'}`);
    child = null;
    if (stopping) { releaseLock(); process.exit(0); return; }
    restarts += 1;
    const delay = Math.min(30000, 1000 * Math.min(restarts, 10));
    log(`${delay / 1000}s 后重启（累计重启 ${restarts} 次）`);
    setTimeout(start, delay);
  });
}

function shutdown() {
  stopping = true;
  if (child) child.kill();
  else { releaseLock(); process.exit(0); }
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start();
