// 开发信模板库：模板列表、变量渲染、预览与新建
import { api, esc, empty, toast, openModal, closeModal, readForm, fmtDate } from '../util.js';

export const TEMPLATE_VARS = {
  contact: '联系人姓名', sender: '发件人', company: '公司名', product: '商品名称', hs_code: 'HS 编码',
  MOQ: '最小起订量', origin: '产地', booth: '展位号', quote_no: '报价单号',
};

function variablesOf(text) {
  return [...new Set([...String(text).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))];
}

function renderPreview(tpl, vars) {
  const fill = (s) => String(s).replace(/\{\{(\w+)\}\}/g, (m, k) => (vars[k] ? esc(vars[k]) : m));
  return `<div class="email-preview"><div class="subj">${fill(tpl.subject)}</div>${fill(tpl.body)}</div>`;
}

export default async function templates({ query }) {
  const { items } = await api('/templates');
  const selected = items.find((t) => String(t.id) === String(query.id)) ?? items[0];
  const vars = { contact: 'Markus Weber', sender: '王芳', company: '宁波海天实业有限公司', product: '不锈钢阀门', hs_code: '8481804090', MOQ: '200 pcs', origin: '浙江宁波', booth: '11.2 C15', quote_no: 'Q20261028' };

  const html = `
  <div class="page-head">
    <div><h1>开发信模板库</h1><p>提前预设多场景模板，降低重复工作与新人上手难度</p></div>
    <div class="spacer"></div>
    <button class="btn primary" id="new-tpl">+ 新建模板</button>
  </div>
  <div class="detail-layout">
    <section class="card">
      <div class="card-head"><h2>模板列表</h2><span class="sub">${items.length} 个</span></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>模板名称</th><th>分类</th><th>主题</th><th>变量</th><th>创建时间</th></tr></thead>
        <tbody>${items.map((t) => `
          <tr class="clickable" data-tpl="${t.id}" style="${selected && t.id === selected.id ? 'background:#f2f7ff' : ''}">
            <td class="name">${esc(t.name)}</td>
            <td><span class="tag blue">${esc(t.category)}</span></td>
            <td class="muted" style="max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.subject)}</td>
            <td>${variablesOf(`${t.subject}${t.body}`).map((v) => `<span class="tag gray">{{${esc(v)}}}</span>`).join(' ')}</td>
            <td class="muted">${fmtDate(t.created_at)}</td>
          </tr>`).join('') || `<tr><td colspan="5">${empty('暂无模板')}</td></tr>`}</tbody>
      </table></div>
    </section>
    <section class="card">
      <div class="card-head"><h2>模板预览</h2><span class="sub">变量已用示例值填充</span><div class="spacer"></div><button class="btn sm" id="copy">复制</button></div>
      <div class="card-body">${selected ? renderPreview(selected, vars) : empty('请选择一个模板')}
        <div class="note mt12"><div>可一键插入邮件正文。支持变量：${Object.entries(TEMPLATE_VARS).map(([k, v]) => `<code>{{${k}}}</code> ${v}`).join(' · ')}</div></div>
      </div>
    </section>
  </div>`;

  return { html, bind: () => bindTemplates(selected) };
}

function bindTemplates(selected) {
  const app = document.getElementById('app');
  app.querySelectorAll('tr[data-tpl]').forEach((tr) => tr.addEventListener('click', () => { location.hash = `#/templates?id=${tr.dataset.tpl}`; }));
  app.querySelector('#copy')?.addEventListener('click', async () => {
    if (!selected) return;
    const text = `${selected.subject}\n\n${selected.body.replace(/<br\s*\/?>/g, '\n').replace(/<\/p>/g, '\n').replace(/<[^>]+>/g, '')}`;
    try {
      await navigator.clipboard.writeText(text);
      toast('已复制到剪贴板');
    } catch { toast('复制失败，请手动选择文本', 'err'); }
  });
  app.querySelector('#new-tpl')?.addEventListener('click', () => {
    const root = openModal({
      title: '新建邮件模板',
      body: `<form id="nt" class="form-grid">
        <div class="field"><label>模板名称 <span class="req">*</span></label><input class="input" name="name" /></div>
        <div class="field"><label>分类</label><select class="input" name="category">${['开发信', '询盘回复', '报价跟进', '节日问候'].map((c) => `<option>${c}</option>`).join('')}</select></div>
        <div class="field full"><label>邮件主题 <span class="req">*</span></label><input class="input" name="subject" placeholder="New {{product}} series from {{company}}" /></div>
        <div class="field full"><label>正文（支持 HTML）</label><textarea class="input" name="body" rows="8" placeholder="<p>Dear {{contact}},</p>…"></textarea></div>
      </form>`,
      footer: '<button class="btn" data-close>取消</button><button class="btn primary" id="ok">保存模板</button>',
    });
    root.querySelector('#ok').addEventListener('click', async () => {
      const form = root.querySelector('#nt');
      if (!form.reportValidity()) return;
      try {
        await api('/templates', { method: 'POST', body: readForm(form) });
        toast('模板已保存');
        closeModal();
        location.reload();
      } catch (e) { toast(e.message, 'err'); }
    });
  });
}
