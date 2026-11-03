// 客户移交：待接收 / 已接收记录，接收人确认后客户归属变更（防重复跟进、业务归属判定）
import { api, esc, fmtDateTime, empty, toast } from '../util.js';

export default async function handovers() {
  const { items } = await api('/handovers');
  const pending = items.filter((h) => h.status === '待接收');
  const done = items.filter((h) => h.status === '已接收');

  const html = `
  <div class="page-head">
    <div><h1>客户移交</h1><p>客保管理的一部分：移交需接收人确认，避免市场部与业务员之间重复跟进、业务归属不清</p></div>
  </div>
  <div class="kpis" style="grid-template-columns: repeat(3, minmax(0,1fr))">
    <div class="kpi"><div class="k-label">待接收</div><div class="k-icon orange">⇄</div><div class="k-value">${pending.length}</div><div class="k-sub">等待接收人确认的移交申请</div></div>
    <div class="kpi"><div class="k-label">已接收</div><div class="k-icon green">✓</div><div class="k-value">${done.length}</div><div class="k-sub">客户归属已变更</div></div>
    <div class="kpi"><div class="k-label">流程说明</div><div class="k-icon blue">i</div><div class="k-value" style="font-size:16px">原负责人 → 接收人</div><div class="k-sub">在客户详情页点击「移交」发起</div></div>
  </div>
  <section class="card mt16">
    <div class="card-head"><h2>移交记录</h2></div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>客户</th><th>从</th><th>至</th><th>原因</th><th>提交时间</th><th>状态</th><th></th></tr></thead>
      <tbody>${items.map((h) => `<tr>
        <td class="name"><a href="#/customers/${h.customer_id}">${esc(h.customer_name ?? '—')}</a><div class="secondary">${esc(h.customer_code ?? '')}</div></td>
        <td>${esc(h.from_name ?? '—')}</td><td>${esc(h.to_name ?? '—')}</td>
        <td class="muted">${esc(h.reason) || '—'}</td>
        <td class="muted">${fmtDateTime(h.created_at)}</td>
        <td><span class="tag ${h.status === '已接收' ? 'green' : 'orange'}">${esc(h.status)}</span></td>
        <td class="actions">${h.status === '待接收' ? `<button class="btn sm primary" data-accept="${h.id}">确认接收</button>` : ''}</td>
      </tr>`).join('') || `<tr><td colspan="7">${empty('暂无移交记录')}</td></tr>`}</tbody>
    </table></div>
  </section>`;

  return {
    html,
    bind: () => {
      document.querySelectorAll('[data-accept]').forEach((b) => b.addEventListener('click', async () => {
        try {
          await api(`/handovers/${b.dataset.accept}/accept`, { method: 'POST', body: {} });
          toast('已接收，客户归属已变更');
          location.reload();
        } catch (e) { toast(e.message, 'err'); }
      }));
    },
  };
}
