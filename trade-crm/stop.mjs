// 停止 trade-crm：先结束守护进程，再结束服务进程，并清理 PID 锁。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = dirname(fileURLToPath(import.meta.url));
const LOCK = join(ROOT, 'logs', 'supervisor.pid');

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

let stopped = 0;
if (existsSync(LOCK)) {
  const pid = Number(readFileSync(LOCK, 'utf8').trim());
  if (pid && alive(pid)) {
    try { process.kill(pid); stopped++; } catch { /* ignore */ }
  }
  writeFileSync(LOCK, '', 'utf8');
}

// 兜底：结束监听 4317 端口的进程
try {
  const out = execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8' });
  for (const line of out.split(/\r?\n/)) {
    if (!line.includes(':4317') || !/LISTENING/.test(line)) continue;
    const pid = Number(line.trim().split(/\s+/).pop());
    if (pid && alive(pid)) {
      try { process.kill(pid); stopped++; } catch { /* ignore */ }
    }
  }
} catch { /* netstat 不可用时忽略 */ }

console.log(stopped ? `已停止 ${stopped} 个进程` : '未发现正在运行的 trade-crm');
// Windows 控制台默认 GBK：显式按 UTF-8 写一遍，避免调用方读取时出现乱码
try { process.stdout.write(''); } catch { /* ignore */ }
