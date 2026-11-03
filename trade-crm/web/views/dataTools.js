// 数据导入 / 导出：把 Excel 导出的 CSV 装进系统，预览确认后写入；也可导出备份与清空演示数据。
import { api, esc, empty, toast, openModal, closeModal, downloadCsv } from '../util.js';

const SPECS = {
  customers: {
    title: '导入客户',
    api: 'customers',
    desc: '支持列：客户名称（必填）、英文名称、国家、行业、客户分级 A/B/C/D、线索来源、负责人、联系人、邮箱、电话、备注',
    file: '客户导入模板.csv',
  },
  customs: {
    title: '导入海关数据',
    api: 'customs',
    desc: '支持列：采购商（必填）、采购商国家、HS编码、商品、日期、TEU、金额、承运。采购商若已建档会自动关联到对应客户',
    file: '海关数据导入模板.csv',
  },
};

// GBK 解码：Excel 在中文 Windows 上「另存为 CSV」默认是 GBK，直接按 UTF-8 读会乱码
async function readFileSmart(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  // 先看是否合法 UTF-8；不合法则按 GBK 解
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return text;
  } catch {
    try {
      return new TextDecoder('gbk').decode(buf);
    } catch {
      return new TextDecoder('utf-8').decode(buf);
    }
  }
}

function parseCsvPreview(text, limit = 5) {
  // 只做展示用的简易解析：按行切分，够预览即可（真正解析在服务端）
  return String(text).replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim()).slice(0, limit + 1);
}

export function openImport(kind, onDone) {
  const spec = SPECS[kind];
  const root = openModal({
    wide: true,
    title: spec.title,
    body: `<div class="note"><div>${esc(spec.desc)}</div></div>
      <div class="flex mt12" style="gap:10px">
        <input type="file" id="csv-file" accept=".csv,text/csv" style="flex:1" />
        <button class="btn" id="dl-tpl">下载模板</button>
      </div>
      <div class="field mt12"><label>或直接粘贴 CSV 内容</label>
        <textarea class="input" id="csv-text" rows="6" placeholder="客户名称,英文名称,国家…"></textarea></div>
      <div id="preview" class="mt12"></div>
      <div id="result" class="mt12"></div>`,
    footer: '<button class="btn" data-close>关闭</button><button class="btn" id="dry-run">先校验（不写入）</button><button class="btn primary" id="do-import" disabled>确认导入</button>',
  });

  let csv = '';
  const preview = root.querySelector('#preview');
  const result = root.querySelector('#result');
  const importBtn = root.querySelector('#do-import');

  const updatePreview = () => {
    if (!csv.trim()) { preview.innerHTML = ''; importBtn.disabled = true; return; }
    const lines = parseCsvPreview(csv, 5);
    preview.innerHTML = `<div class="small muted">预览前 ${Math.max(0, lines.length - 1)} 行：</div>
      <div class="table-wrap" style="max-height:180px"><table class="table"><tbody>
      ${lines.map((l, i) => `<tr>${l.split(',').map((c) => `<td class="${i === 0 ? 'muted' : ''}">${esc(c.replace(/^"|"$/g, ''))}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>`;
    importBtn.disabled = lines.length < 2;
  };

  root.querySelector('#csv-file').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    csv = await readFileSmart(f);
    root.querySelector('#csv-text').value = csv.slice(0, 20000);
    updatePreview();
  });
  root.querySelector('#csv-text').addEventListener('input', (e) => {
    csv = e.target.value;
    updatePreview();
  });

  root.querySelector('#dl-tpl').addEventListener('click', () => {
    api(`/import/template/${spec.api}`).then((r) => {
      const blob = new Blob(['\ufeff' + r.csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = spec.file;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }).catch((e) => toast(e.message, 'err'));
  });

  const runImport = async (dryRun) => {
    if (!csv.trim()) return toast('请先选择文件或粘贴内容', 'err');
    result.innerHTML = '<div class="loading">处理中…</div>';
    try {
      const r = await api(`/import/${spec.api}`, { method: 'POST', body: { csv, dry_run: dryRun } });
      const parts = [`共 <b>${r.total}</b> 行`, `新增 <b>${r.created}</b>`, `跳过重复 <b>${r.skipped}</b>`];
      if (r.matched !== undefined) parts.push(`关联已有客户 <b>${r.matched}</b>`);
      if (r.contacts !== undefined) parts.push(`导入联系人 <b>${r.contacts}</b>`);
      result.innerHTML = `<div class="note ${r.errors.length ? 'warn' : ''}">
        <div>${dryRun ? '校验结果（未写入数据库）：' : '导入结果：'}${parts.join(' · ')}</div>
        ${r.errors.length ? `<div class="mt8">${r.errors.slice(0, 8).map((e) => `第 ${e.line} 行：${esc(e.message)}`).join('<br>')}${r.errors.length > 8 ? `<br>…还有 ${r.errors.length - 8} 条` : ''}</div>` : ''}
        ${r.duplicates?.length ? `<div class="mt8">重复跳过：${r.duplicates.slice(0, 6).map((d) => esc(d.name)).join('、')}${r.duplicates.length > 6 ? ' …' : ''}</div>` : ''}
      </div>`;
      if (!dryRun && r.created > 0) {
        toast(`成功导入 ${r.created} 条`);
        importBtn.disabled = true;
        onDone?.();
      }
    } catch (e) {
      result.innerHTML = `<div class="note warn">${esc(e.message)}</div>`;
    }
  };

  root.querySelector('#dry-run').addEventListener('click', () => runImport(true));
  importBtn.addEventListener('click', () => runImport(false));
}

export function openDataTools(onChanged) {
  const root = openModal({
    title: '数据管理',
    body: `<div class="note"><div><b>当前数据是演示数据</b>：客户、联系人、海关记录均为程序生成的虚构内容，用于体验功能。</div></div>
      <div class="mt16"><b>换成你自己的数据</b></div>
      <ol class="small" style="color:var(--ink-2);line-height:1.9;padding-left:20px">
        <li>先点「导出客户 CSV」备份当前数据（可选）</li>
        <li>点「清空演示数据」</li>
        <li>回到客户档案页点「导入 CSV」，上传你的客户表</li>
        <li>到海关数据分析页导入你的提单数据</li>
      </ol>
      <div class="flex wrap mt12">
        <button class="btn" id="exp">导出客户 CSV</button>
        <button class="btn" id="imp-c">导入客户</button>
        <button class="btn" id="imp-s">导入海关数据</button>
        <button class="btn danger" id="clear">清空演示数据</button>
      </div>`,
    footer: '<button class="btn" data-close>关闭</button>',
  });
  root.querySelector('#exp').addEventListener('click', async () => {
    try {
      const r = await api('/customers/export');
      downloadCsv(`客户导出-${new Date().toISOString().slice(0, 10)}.csv`, r.csv.split(/\r?\n/).map((l) => l.split(',')));
      toast(`已导出 ${r.count} 个客户`);
    } catch (e) { toast(e.message, 'err'); }
  });
  root.querySelector('#imp-c').addEventListener('click', () => { closeModal(); openImport('customers', onChanged); });
  root.querySelector('#imp-s').addEventListener('click', () => { closeModal(); openImport('customs', onChanged); });
  root.querySelector('#clear').addEventListener('click', async () => {
    if (!confirm('确定清空所有客户、联系人、海关记录、商机、跟进与营销活动？此操作不可撤销。')) return;
    try {
      await api('/reset', { method: 'POST', body: { confirm: 'DELETE' } });
      toast('已清空，可以导入你自己的数据了');
      closeModal();
      onChanged?.();
    } catch (e) { toast(e.message, 'err'); }
  });
}
