// 商机管理：阶段看板 + 列表，支持新建、推进阶段、金额维护
import { api, avatar, esc, fmtDate, fmtMoney, fmtUsd, stageTag, empty, openModal, closeModal, readForm, toast, debounce } from '../util.js';

const STAGES = ['初步接触', '需求确认', '报价中', '谈判中', '赢单', '输单'];
const STAGE_COLOR = { 初步接触: '#8a93a6', 需求确认: '#1c5fd8', 报价中: '#7b5cd6', 谈判中: '#f08c1a', 赢单: '#12a16b', 输单: '#e0483f' };

function openOppForm(customers, onSaved) {
  const root = openModal({
    title: '新建商机',
    body: `<form id="opp" class="form-grid">
      <div class="field full"><label>商机名称 <span class="req">*</span></label><input class="input" name="title" placeholder="例如：不锈钢阀门 · 年度采购计划" /></div>
      <div class="field full"><label>关联客户 <span class="req">*</span></label>
        <select class="input" name="customer_id">${customers.map((c) => `<option value="${c.id}">${esc(c.name)} · ${esc(c.name_en)}</option>`).join('')}</select></div>
      <div class="field"><label>阶段</label><select class="input" name="stage">${STAGES.map((s) => `<option>${s}</option>`).join('')}</select></div>
      <div class="field"><label>预计金额（USD）</label><input class="input" name="amount_usd" type="number" min="0" step="1000" value="50000" /></div>
      <div class="field"><label>预计成交日期</label><input class="input" name="expected_close" type="date" /></div>
      <div class="field"><label>来源</label><input class="input" name="source" placeholder="海关数据 / 展会 / 询盘" /></div>
    </form>`,
    footer: '<button class="btn" data-close>取消</button><button class="btn primary" id="ok">创建商机</button>',
  });
  root.querySelector('#ok').addEventListener('click', async () => {
    const form = root.querySelector('#opp');
    if (!form.reportValidity()) return;
    try {
      await api('/opportunities', { method: 'POST', body: readForm(form) });
      toast('商机已创建');
      closeModal();
      onSaved?.();
    } catch (e) { toast(e.message, 'err'); }
  });
}

function openOppEdit(o, onSaved) {
  const root = openModal({
    title: `编辑商机 · ${o.code}`,
    body: `<form id="opp" class="form-grid">
      <div class="field full"><label>商机名称</label><input class="input" name="title" value="${esc(o.title)}" /></div>
      <div class="field"><label>阶段</label><select class="input" name="stage">${STAGES.map((s) => `<option ${s === o.stage ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="field"><label>预计金额（USD）</label><input class="input" name="amount_usd" type="number" value="${o.amount_usd}" /></div>
      <div class="field"><label>赢单概率（%）</label><input class="input" name="win_rate" type="number" min="0" max="100" value="${o.win_rate}" /></div>
      <div class="field"><label>预计成交日期</label><input class="input" name="expected_close" type="date" value="${esc(o.expected_close ?? '')}" /></div>
    </form>`,
    footer: '<button class="btn" data-close>取消</button><button class="btn primary" id="ok">保存</button>',
  });
  root.querySelector('#ok').addEventListener('click', async () => {
    try {
      await api(`/opportunities/${o.id}`, { method: 'PUT', body: readForm(root.querySelector('#opp')) });
      toast('商机已更新');
      closeModal();
      onSaved?.();
    } catch (e) { toast(e.message, 'err'); }
  });
}

export default async function opportunities({ query }) {
  const [data, customerData] = await Promise.all([
    api('/opportunities', { query: { keyword: query.keyword } }),
    api('/customers', { query: { size: 100 } }),
  ]);
  const items = data.items;
  const view = query.view === 'list' ? 'list' : 'board';
  const won = data.pipeline.find((p) => p.stage === '赢单');
  const lost = data.pipeline.find((p) => p.stage === '输单');
  const decided = (won?.count ?? 0) + (lost?.count ?? 0);
  const winRate = decided ? Math.round(((won?.count ?? 0) / decided) * 100) : 0;
  const openAmount = data.pipeline.filter((p) => !['赢单', '输单'].includes(p.stage)).reduce((a, b) => a + b.amount, 0);
  const openCount = data.pipeline.filter((p) => !['赢单', '输单'].includes(p.stage)).reduce((a, b) => a + b.count, 0);

  const board = `<div class="kanban mt16">
    ${STAGES.map((s) => {
      const rows = items.filter((o) => o.stage === s);
      const amount = rows.reduce((a, b) => a + b.amount_usd, 0);
      return `<div class="kanban-col" data-stage="${s}">
        <header><span class="dot" style="color:${STAGE_COLOR[s]}"></span>${s}<span class="cnt">${rows.length}</span><span class="spacer"></span><span class="muted small">${fmtMoney(amount)}</span></header>
        ${rows.map((o) => `
          <div class="kanban-card ${s === '赢单' ? 'stage-won' : s === '输单' ? 'stage-lost' : ''}" draggable="true" data-opp="${o.id}">
            <div class="kc-title">${esc(o.title)}</div>
            <div class="kc-sub">${esc(o.customer_name)} · ${esc(o.country)}</div>
            <div class="kc-foot"><span class="money">${fmtUsd(o.amount_usd)}</span>
              <span class="flex">${avatar(o.owner_name, o.owner_id, 'sm')}<span class="muted small">${fmtDate(o.expected_close).slice(5)}</span></span></div>
          </div>`).join('') || '<div class="muted small" style="padding:14px 6px">拖拽商机卡片到此阶段</div>'}
      </div>`;
    }).join('')}
  </div>`;

  const list = `<section class="card mt16"><div class="table-wrap"><table class="table">
    <thead><tr><th>编号</th><th>商机</th><th>客户</th><th>阶段</th><th class="right">金额</th><th class="right">概率</th><th>预计成交</th><th>负责人</th><th>来源</th><th></th></tr></thead>
    <tbody>${items.map((o) => `<tr>
      <td class="muted">${esc(o.code)}</td><td class="name">${esc(o.title)}</td>
      <td><a href="#/customers/${o.customer_id}">${esc(o.customer_name)}</a><div class="secondary">${esc(o.country)}</div></td>
      <td>${stageTag(o.stage)}</td><td class="num">${fmtUsd(o.amount_usd)}</td><td class="num">${o.win_rate}%</td>
      <td class="muted">${fmtDate(o.expected_close)}</td>
      <td>${avatar(o.owner_name, o.owner_id, 'sm')} ${esc(o.owner_name ?? '')}</td>
      <td><span class="tag outline">${esc(o.source) || '—'}</span></td>
      <td class="actions"><button class="btn sm" data-edit="${o.id}">编辑</button></td></tr>`).join('') || `<tr><td colspan="10">${empty('暂无商机')}</td></tr>`}</tbody>
  </table></div></section>`;

  const html = `
  <div class="page-head">
    <div><h1>商机管理</h1><p>可视化监控商机流程进度，分析赢单 / 丢单原因，复盘转化流程</p></div>
    <div class="spacer"></div>
    <div class="seg"><button class="${view === 'board' ? 'on' : ''}" data-view="board">看板</button><button class="${view === 'list' ? 'on' : ''}" data-view="list">列表</button></div>
    <input class="input" id="kw" placeholder="搜索商机 / 客户" style="width:220px" value="${esc(query.keyword ?? '')}" />
    <button class="btn primary" id="new-opp">+ 新建商机</button>
  </div>
  <div class="kpis" style="grid-template-columns: repeat(4, minmax(0,1fr))">
    <div class="kpi"><div class="k-label">进行中商机金额</div><div class="k-icon blue">◇</div><div class="k-value">${fmtMoney(openAmount)}</div><div class="k-sub">${openCount} 个商机</div></div>
    <div class="kpi"><div class="k-label">赢单金额</div><div class="k-icon green">✓</div><div class="k-value">${fmtMoney(won?.amount ?? 0)}</div><div class="k-sub">${won?.count ?? 0} 个赢单</div></div>
    <div class="kpi"><div class="k-label">赢单率</div><div class="k-icon purple">%</div><div class="k-value">${winRate}%</div><div class="k-sub">赢单 /（赢单 + 丢单）</div></div>
    <div class="kpi"><div class="k-label">丢单</div><div class="k-icon red">✕</div><div class="k-value">${lost?.count ?? 0}</div><div class="k-sub">金额 ${fmtMoney(lost?.amount ?? 0)}</div></div>
  </div>
  ${view === 'board' ? board : list}`;

  return { html, bind: () => bindOpps(items, customerData.items, view, query) };
}

function bindOpps(items, customers, view, query) {
  const app = document.getElementById('app');
  app.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
    location.hash = `#/opportunities?view=${b.dataset.view}${query.keyword ? `&keyword=${encodeURIComponent(query.keyword)}` : ''}`;
  }));
  app.querySelector('#new-opp')?.addEventListener('click', () => openOppForm(customers, () => location.reload()));
  app.querySelector('#kw')?.addEventListener('input', debounce((e) => {
    const kw = e.target.value.trim();
    location.hash = `#/opportunities?view=${view}${kw ? `&keyword=${encodeURIComponent(kw)}` : ''}`;
  }, 350));
  app.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
    openOppEdit(items.find((o) => String(o.id) === b.dataset.edit), () => location.reload());
  }));
  let dragId = null;
  app.querySelectorAll('.kanban-card').forEach((card) => {
    card.addEventListener('dragstart', () => { dragId = card.dataset.opp; card.style.opacity = '.5'; });
    card.addEventListener('dragend', () => { card.style.opacity = ''; });
    card.addEventListener('click', () => {
      openOppEdit(items.find((o) => String(o.id) === card.dataset.opp), () => location.reload());
    });
  });
  app.querySelectorAll('.kanban-col').forEach((col) => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.style.outline = '2px dashed #9ab7f0'; });
    col.addEventListener('dragleave', () => { col.style.outline = ''; });
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.style.outline = '';
      const id = dragId ?? e.dataTransfer?.getData('text/plain');
      const o = items.find((i) => String(i.id) === String(id));
      if (!id || !o || o.stage === col.dataset.stage) return;
      try {
        await api(`/opportunities/${id}`, { method: 'PUT', body: { stage: col.dataset.stage } });
        toast(`「${o.title}」已进入 ${col.dataset.stage}`);
        location.reload();
      } catch (err) { toast(err.message, 'err'); }
    });
  });
}
