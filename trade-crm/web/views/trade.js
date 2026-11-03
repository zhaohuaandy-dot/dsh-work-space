// 交易管理：报价单（多商品明细、审批状态流转、转订单）与订单（可视化跟单、收款进度）
import { api, esc, fmtDate, fmtInt, fmtMoney, fmtUsd, empty, openModal, closeModal, readForm, toast, debounce, downloadCsv } from '../util.js';
import { getOptions } from './customers.js';

const QUOTE_TAG = { 草稿: 'gray', 待审批: 'orange', 已发出: 'blue', 已接受: 'green', 已拒绝: 'red', 已过期: 'gray' };
const ORDER_FLOW = ['待生产', '生产中', '待出运', '已出运', '已签收'];
const ORDER_TAG = { 待生产: 'gray', 生产中: 'blue', 待出运: 'purple', 已出运: 'orange', 已签收: 'green', 已取消: 'red' };
const PAY_TAG = { 未收款: 'red', 部分收款: 'orange', 已收齐: 'green' };

function openQuotationForm(customers, onSaved) {
  const itemRow = (n = 0) => `<tr data-item="${n}">
    <td><input class="input" name="product" placeholder="商品名称" /></td>
    <td><input class="input" name="hs_code" placeholder="HS 编码" /></td>
    <td><input class="input" name="spec" placeholder="规格" /></td>
    <td><input class="input" name="qty" type="number" min="0" value="1" /></td>
    <td><input class="input" name="unit_price" type="number" min="0" step="0.01" value="0" /></td>
  </tr>`;
  const root = openModal({
    wide: true,
    title: '新建报价单',
    body: `<form id="qt" class="form-grid">
      <div class="field full"><label>报价标题 <span class="req">*</span></label><input class="input" name="title" placeholder="例如：不锈钢阀门 DN50 试单报价" /></div>
      <div class="field"><label>客户 <span class="req">*</span></label><select class="input" name="customer_id">${customers.map((c) => `<option value="${c.id}">${esc(c.name)} · ${esc(c.country)}</option>`).join('')}</select></div>
      <div class="field"><label>有效期至</label><input class="input" type="date" name="valid_until" /></div>
      <div class="field"><label>贸易术语</label><select class="input" name="incoterms">${['FOB', 'CIF', 'CFR', 'EXW', 'DDP'].map((t) => `<option>${t}</option>`).join('')}</select></div>
      <div class="field"><label>装运港</label><input class="input" name="port" placeholder="宁波港" /></div>
      <div class="field full"><label>商品明细</label>
        <table class="table" style="border:1px solid var(--line);border-radius:8px;overflow:hidden">
          <thead><tr><th>商品</th><th>HS 编码</th><th>规格</th><th style="width:100px">数量</th><th style="width:130px">单价 USD</th></tr></thead>
          <tbody id="items">${[0, 1].map((n) => itemRow(n)).join('')}</tbody>
        </table>
        <button type="button" class="btn sm mt8" id="add-item">+ 增加一行</button>
      </div>
    </form>`,
    footer: '<button class="btn" data-close>取消</button><button class="btn primary" id="ok">保存报价单</button>',
  });
  let seq = 2;
  root.querySelector('#add-item').addEventListener('click', () => {
    root.querySelector('#items').insertAdjacentHTML('beforeend', itemRow(seq++));
  });
  root.querySelector('#ok').addEventListener('click', async () => {
    const form = root.querySelector('#qt');
    if (!form.reportValidity()) return;
    const d = readForm(form);
    const items = [...form.querySelectorAll('#items tr')].map((tr) => ({
      product: tr.querySelector('[name=product]').value.trim(),
      hs_code: tr.querySelector('[name=hs_code]').value.trim(),
      spec: tr.querySelector('[name=spec]').value.trim(),
      qty: Number(tr.querySelector('[name=qty]').value),
      unit_price: Number(tr.querySelector('[name=unit_price]').value),
    })).filter((i) => i.product);
    if (!items.length) return toast('请至少填写一行商品', 'err');
    try {
      const r = await api('/quotations', { method: 'POST', body: { ...d, items } });
      toast(`报价单 ${r.code} 已创建`);
      closeModal();
      onSaved?.(r);
    } catch (e) { toast(e.message, 'err'); }
  });
}

function openOrderForm(customers, quotations, onSaved) {
  const root = openModal({
    title: '新建订单',
    body: `<form id="od" class="form-grid">
      <div class="field full"><label>订单标题 <span class="req">*</span></label><input class="input" name="title" placeholder="例如：不锈钢阀门 出口订单" /></div>
      <div class="field"><label>客户 <span class="req">*</span></label><select class="input" name="customer_id">${customers.map((c) => `<option value="${c.id}">${esc(c.name)} · ${esc(c.country)}</option>`).join('')}</select></div>
      <div class="field"><label>关联报价单</label><select class="input" name="quotation_id"><option value="">不关联</option>${quotations.map((q) => `<option value="${q.id}">${esc(q.code)} · ${esc(q.title)}</option>`).join('')}</select></div>
      <div class="field"><label>金额（USD）</label><input class="input" name="amount_usd" type="number" min="0" step="100" value="50000" /></div>
      <div class="field"><label>贸易术语</label><select class="input" name="incoterms">${['FOB', 'CIF', 'CFR', 'EXW', 'DDP'].map((t) => `<option>${t}</option>`).join('')}</select></div>
      <div class="field"><label>预计离港 ETD</label><input class="input" name="etd" type="date" /></div>
      <div class="field"><label>预计到港 ETA</label><input class="input" name="eta" type="date" /></div>
    </form>`,
    footer: '<button class="btn" data-close>取消</button><button class="btn primary" id="ok">创建订单</button>',
  });
  root.querySelector('#ok').addEventListener('click', async () => {
    const form = root.querySelector('#od');
    if (!form.reportValidity()) return;
    try {
      const r = await api('/orders', { method: 'POST', body: readForm(form) });
      toast(`订单 ${r.code} 已创建`);
      closeModal();
      onSaved?.();
    } catch (e) { toast(e.message, 'err'); }
  });
}

function openQuotationDetail(q, onChanged) {
  const root = openModal({
    wide: true,
    title: `报价单 ${q.code}`,
    body: `<div class="flex wrap" style="gap:20px">
        <div><div class="muted small">客户</div><b>${esc(q.customer_name)}</b> <span class="muted small">${esc(q.name_en)}</span></div>
        <div><div class="muted small">贸易术语 / 港口</div><b>${esc(q.incoterms)} · ${esc(q.port || '—')}</b></div>
        <div><div class="muted small">有效期至</div><b>${fmtDate(q.valid_until)}</b></div>
        <div><div class="muted small">状态</div><span class="tag ${QUOTE_TAG[q.status] ?? 'gray'}">${esc(q.status)}</span></div>
        <div><div class="muted small">报价总额</div><b class="money">${fmtUsd(q.total)}</b></div>
      </div>
      <div class="table-wrap mt16"><table class="table">
        <thead><tr><th>商品</th><th>HS 编码</th><th>规格</th><th class="right">数量</th><th class="right">单价</th><th class="right">小计</th></tr></thead>
        <tbody>${q.items.map((i) => `<tr><td>${esc(i.product)}</td><td class="muted">${esc(i.hs_code) || '—'}</td><td>${esc(i.spec) || '—'}</td>
          <td class="num right">${fmtInt(i.qty)}</td><td class="num right">${fmtUsd(i.unit_price)}</td><td class="num right">${fmtUsd(i.qty * i.unit_price)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="5" class="right muted">合计</td><td class="right money">${fmtUsd(q.total)}</td></tr></tfoot>
      </table></div>`,
    footer: `${q.status === '已接受' ? '' : '<button class="btn" id="send">标记已发出</button><button class="btn primary" id="convert">转为订单</button>'}<button class="btn" data-close>关闭</button>`,
  });
  root.querySelector('#send')?.addEventListener('click', async () => {
    try {
      await api(`/quotations/${q.id}/status`, { method: 'POST', body: { status: '已发出' } });
      toast('报价单状态已更新');
      closeModal();
      onChanged?.();
    } catch (e) { toast(e.message, 'err'); }
  });
  root.querySelector('#convert')?.addEventListener('click', async () => {
    try {
      const r = await api(`/quotations/${q.id}/convert`, { method: 'POST', body: {} });
      toast(`已生成订单 ${r.code}`);
      closeModal();
      onChanged?.(r);
    } catch (e) { toast(e.message, 'err'); }
  });
}

export default async function trade({ query }) {
  const tab = query.tab === 'orders' ? 'orders' : 'quotations';
  const [summary, customers] = await Promise.all([api('/trade/summary'), api('/customers', { query: { size: 100 } })]);
  const quotes = await api('/quotations', { query: { keyword: query.keyword } });
  const orders = tab === 'orders' ? await api('/orders', { query: { keyword: query.keyword } }) : { items: [], summary: { count: 0, amount: 0, paid: 0, unpaid: 0 } };

  const quoteRows = quotes.items.map((q) => `<tr>
      <td class="muted">${esc(q.code)}</td>
      <td class="name">${esc(q.title)}<div class="secondary">${esc(q.item_count)} 项商品</div></td>
      <td><a href="#/customers/${q.customer_id}">${esc(q.customer_name)}</a><div class="secondary">${esc(q.country)}</div></td>
      <td><span class="tag outline">${esc(q.incoterms)}</span> <span class="muted small">${esc(q.port) || '—'}</span></td>
      <td class="num">${fmtUsd(q.total)}</td>
      <td class="muted">${fmtDate(q.valid_until)}</td>
      <td><span class="tag ${QUOTE_TAG[q.status] ?? 'gray'}">${esc(q.status)}</span></td>
      <td>${esc(q.owner_name ?? '—')}</td>
      <td class="actions"><button class="btn sm" data-quote="${q.id}">查看</button></td>
    </tr>`).join('');

  const orderRows = orders.items.map((o) => `<tr>
      <td class="muted">${esc(o.code)}</td>
      <td class="name">${esc(o.title)}${o.quotation_code ? `<div class="secondary">来源报价 ${esc(o.quotation_code)}</div>` : ''}</td>
      <td><a href="#/customers/${o.customer_id}">${esc(o.customer_name)}</a><div class="secondary">${esc(o.country)}</div></td>
      <td class="num">${fmtUsd(o.amount_usd)}</td>
      <td><span class="tag ${ORDER_TAG[o.status] ?? 'gray'}">${esc(o.status)}</span>
        <div class="progress ${o.status === '已签收' ? 'green' : o.status === '已取消' ? 'orange' : ''}" style="width:90px;margin-top:6px">
          <i style="width:${Math.max(0, (ORDER_FLOW.indexOf(o.status) + 1) / ORDER_FLOW.length * 100)}%"></i></div></td>
      <td><span class="tag ${PAY_TAG[o.payment_status] ?? 'gray'}">${esc(o.payment_status)}</span>
        <div class="secondary num">${fmtUsd(o.deposit_paid)} / ${fmtUsd(o.amount_usd)}</div></td>
      <td class="muted small">${fmtDate(o.etd)} → ${fmtDate(o.eta)}</td>
      <td>${esc(o.owner_name ?? '—')}</td>
      <td class="actions">
        <select class="input" data-order="${o.id}" style="width:auto;height:26px;padding:0 6px">
          ${[...ORDER_FLOW, '已取消'].map((s) => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </td>
    </tr>`).join('');

  const html = `
  <div class="page-head">
    <div><h1>交易管理</h1><p>报价单规范报价与审批流转，报价转订单后可视化跟单，实时掌握出运与收款进度</p></div>
    <div class="spacer"></div>
    <div class="seg"><button class="${tab === 'quotations' ? 'on' : ''}" data-tab="quotations">报价单</button><button class="${tab === 'orders' ? 'on' : ''}" data-tab="orders">订单</button></div>
    <input class="input" id="kw" placeholder="搜索编号 / 客户 / 标题" style="width:220px" value="${esc(query.keyword ?? '')}" />
    <button class="btn primary" id="new-quote" ${tab === 'orders' ? 'hidden' : ''}>+ 新建报价单</button>
    <button class="btn primary" id="new-order" ${tab === 'orders' ? '' : 'hidden'}>+ 新建订单</button>
  </div>

  <div class="kpis" style="grid-template-columns: repeat(5, minmax(0,1fr))">
    <div class="kpi"><div class="k-label">报价单</div><div class="k-icon blue">❏</div><div class="k-value">${fmtInt(summary.quotations.count)}</div><div class="k-sub">总额 ${fmtMoney(summary.quotations.amount)}</div></div>
    <div class="kpi"><div class="k-label">待跟进报价</div><div class="k-icon orange">⏱</div><div class="k-value">${fmtInt(summary.quotations.pending)}</div><div class="k-sub">待审批 + 已发出</div></div>
    <div class="kpi"><div class="k-label">订单数</div><div class="k-icon purple">▣</div><div class="k-value">${fmtInt(summary.orders.count)}</div><div class="k-sub">在执行 ${summary.orders.open} 单</div></div>
    <div class="kpi"><div class="k-label">订单金额</div><div class="k-icon green">$</div><div class="k-value">${fmtMoney(summary.orders.amount)}</div><div class="k-sub">已收款 ${fmtMoney(summary.orders.paid)}</div></div>
    <div class="kpi"><div class="k-label">14 天内出运</div><div class="k-icon red">⚓</div><div class="k-value">${fmtInt(summary.orders.dueSoon)}</div><div class="k-sub">按预计离港日统计</div></div>
  </div>

  ${tab === 'quotations' ? `
  <section class="card mt16">
    <div class="card-head"><h2>报价单</h2><span class="sub">共 ${quotes.items.length} 份</span><div class="spacer"></div>
      <span class="muted small">${quotes.byStatus.map((s) => `${s.status} ${s.count}`).join(' · ')}</span></div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>编号</th><th>报价标题</th><th>客户</th><th>术语 / 港口</th><th class="right">总额</th><th>有效期</th><th>状态</th><th>负责人</th><th></th></tr></thead>
      <tbody>${quoteRows || `<tr><td colspan="9">${empty('暂无报价单')}</td></tr>`}</tbody>
    </table></div>
  </section>` : `
  <section class="card mt16">
    <div class="card-head"><h2>订单与跟单</h2><span class="sub">共 ${orders.items.length} 单 · 已收款 ${fmtMoney(orders.summary.paid)} / 待收 ${fmtMoney(orders.summary.unpaid)}</span><div class="spacer"></div>
      <button class="btn ghost sm" id="export-orders">导出 CSV</button></div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>订单号</th><th>订单</th><th>客户</th><th class="right">金额</th><th>生产 / 出运状态</th><th>收款</th><th>ETD → ETA</th><th>负责人</th><th>推进状态</th></tr></thead>
      <tbody>${orderRows || `<tr><td colspan="9">${empty('暂无订单')}</td></tr>`}</tbody>
    </table></div>
  </section>`}`;

  return { html, bind: () => bindTrade(tab, customers.items, quotes.items, orders) };
}

function bindTrade(tab, customers, quotations, orders) {
  const app = document.getElementById('app');
  app.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    location.hash = `#/trade?tab=${b.dataset.tab}`;
  }));
  app.querySelector('#kw')?.addEventListener('input', debounce((e) => {
    const kw = e.target.value.trim();
    location.hash = `#/trade?tab=${tab}${kw ? `&keyword=${encodeURIComponent(kw)}` : ''}`;
  }, 350));
  app.querySelector('#new-quote')?.addEventListener('click', () => openQuotationForm(customers, () => location.reload()));
  app.querySelector('#new-order')?.addEventListener('click', () => openOrderForm(customers, quotations, () => location.reload()));
  app.querySelectorAll('[data-quote]').forEach((b) => b.addEventListener('click', async () => {
    try {
      const d = await api(`/quotations/${b.dataset.quote}`);
      openQuotationDetail({ ...d.quotation, items: d.items }, (r) => {
        if (r?.code?.startsWith('SO')) location.hash = '#/trade?tab=orders';
        else location.reload();
      });
    } catch (e) { toast(e.message, 'err'); }
  }));
  app.querySelectorAll('select[data-order]').forEach((sel) => sel.addEventListener('change', async () => {
    try {
      await api(`/orders/${sel.dataset.order}`, { method: 'PUT', body: { status: sel.value } });
      toast('订单状态已更新');
      location.reload();
    } catch (e) { toast(e.message, 'err'); }
  }));
  app.querySelector('#export-orders')?.addEventListener('click', () => {
    const rows = [['订单号', '订单标题', '客户', '金额USD', '状态', '收款状态', '已收款', 'ETD', 'ETA']];
    for (const o of orders.items) rows.push([o.code, o.title, o.customer_name, o.amount_usd, o.status, o.payment_status, o.deposit_paid, o.etd ?? '', o.eta ?? '']);
    downloadCsv('订单列表.csv', rows);
  });
}
