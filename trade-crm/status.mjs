// 服务状态检查：进程、端口、接口与最近日志。
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4317);
const LOCK = join(ROOT, 'logs', 'supervisor.pid');
const LOG = join(ROOT, 'logs', 'server.log');

const out = [];
out.push(`安装目录：${ROOT}`);
out.push(`访问地址：http://127.0.0.1:${PORT}`);

let supPid = 0;
if (existsSync(LOCK)) {
  supPid = Number(readFileSync(LOCK, 'utf8').trim()) || 0;
}
let supAlive = false;
if (supPid) {
  try { process.kill(supPid, 0); supAlive = true; } catch { supAlive = false; }
}
out.push(`守护进程：${supPid ? `pid ${supPid} ${supAlive ? '运行中' : '已退出'}` : '未启动'}`);

try {
  const res = await fetch(`http://127.0.0.1:${PORT}/api/ping`, { signal: AbortSignal.timeout(3000) });
  const body = await res.json();
  out.push(`接口状态：正常（${body.at}）`);
} catch {
  out.push('接口状态：无法连接');
}

try {
  const stats = await (await fetch(`http://127.0.0.1:${PORT}/api/stats`, { signal: AbortSignal.timeout(3000) })).json();
  out.push(`数据概览：客户 ${stats.customers?.total ?? '?'} 个 · 海关提单 ${stats.customs?.shipments ?? '?'} 票 · 商机 ${stats.opportunities?.open ?? '?'} 个`);
} catch { /* 服务未启动时跳过 */ }

if (existsSync(LOG)) {
  const lines = readFileSync(LOG, 'utf8').trim().split(/\r?\n/);
  out.push('最近日志：');
  for (const line of lines.slice(-5)) out.push(`  ${line}`);
}

console.log(out.join('\n'));
