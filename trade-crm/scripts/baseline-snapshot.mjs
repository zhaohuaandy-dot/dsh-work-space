// 生成基线（main 分支）状态快照页面，用于 PR 的 Before 证据。
// 用法：node scripts/baseline-snapshot.mjs <baselineCloneDir> <outputHtml>
// 该页面由 baseline 克隆的真实文件树与文件内容生成，不含任何伪造的界面。
import { readdirSync, readFileSync, writeFileSync, statSync, mkdirSync } from 'node:fs';
import { join, relative, sep, dirname } from 'node:path';

const [dir, outFile] = process.argv.slice(2);
if (!dir || !outFile) {
  console.error('用法：node scripts/baseline-snapshot.mjs <baselineCloneDir> <outputHtml>');
  process.exit(1);
}

function walk(base, current = base, acc = []) {
  for (const name of readdirSync(current).sort()) {
    if (name === '.git' || name === 'node_modules') continue;
    const full = join(current, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(base, full, acc);
    else acc.push({ path: relative(base, full).split(sep).join('/'), size: st.size });
  }
  return acc;
}

const files = walk(dir);
const total = files.reduce((a, f) => a + f.size, 0);
const readme = files.find((f) => f.path.toLowerCase() === 'readme.md');
const readmeText = readme ? readFileSync(join(dir, readme.path), 'utf8') : '';
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8" /><title>基线状态 · main 分支</title>
<style>
  body { margin: 0; font: 13px/1.6 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; background: #f2f4f8; color: #1d2330; }
  .wrap { max-width: 980px; margin: 32px auto; padding: 0 20px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #8a93a6; font-size: 12.5px; margin-bottom: 20px; }
  .card { background: #fff; border: 1px solid #e6e9f0; border-radius: 10px; padding: 16px 18px; margin-bottom: 16px; box-shadow: 0 1px 2px rgba(20,30,60,.06); }
  .card h2 { font-size: 14px; margin: 0 0 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th { text-align: left; color: #8a93a6; font-weight: 500; background: #f7f9fc; padding: 8px 10px; border-bottom: 1px solid #e6e9f0; }
  td { padding: 8px 10px; border-bottom: 1px solid #eff1f6; font-variant-numeric: tabular-nums; }
  pre { margin: 0; background: #fbfcfe; border: 1px solid #e6e9f0; border-radius: 8px; padding: 12px; font-size: 12px; overflow: auto; }
  .empty { color: #b0463c; background: #fdecea; border: 1px solid #f6d3cf; border-radius: 8px; padding: 10px 12px; font-size: 12.5px; }
  .muted { color: #8a93a6; }
</style></head>
<body><div class="wrap">
  <h1>仓库基线状态</h1>
  <div class="sub">main 分支（本次改动之前）：初始化提交 2673069，仅包含 README.md，没有任何应用代码或界面。</div>
  <div class="card">
    <h2>文件清单（共 ${files.length} 个文件，${total} 字节）</h2>
    <table><thead><tr><th>路径</th><th>大小（字节）</th></tr></thead><tbody>
      ${files.map((f) => `<tr><td>${esc(f.path)}</td><td>${f.size}</td></tr>`).join('')}
    </tbody></table>
  </div>
  <div class="card">
    <h2>README.md 内容</h2>
    <pre>${esc(readmeText)}</pre>
  </div>
  <div class="empty">基线中不存在可访问的 Web 界面、API 或数据，因此“改动前”没有可截图的页面。</div>
</div></body></html>`;

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, html, 'utf8');
console.log(`已生成 ${outFile}（${files.length} 个文件）`);
