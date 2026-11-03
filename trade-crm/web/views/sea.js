// 公海管理：无人认领客户池，支持领取、搜索与分配
import { api, esc, fmtDate, fmtInt, levelTag, empty, toast, debounce, openModal, closeModal, readForm } from '../util.js';
import { getOptions, openCustomerForm } from './customers.js';

export default async function sea({ query }) {
  const opts = await getOptions();
  const data = await api('/customers', { query: { sea: '1', keyword: query.keyword, size: 50 } });
  const items = data.items;

  const html = `
  <div class="page-head">
    <div><h1>公海管理</h1><p>盘活客户资源，加速客户流转 —— 领取后自动进入客保期，到期未跟进可再次释放</p></div>
    <div class="spacer"></div>
    <button class="btn" id="new-customer">+ 新建客户</button>
  </div>
  <div class="kpis" style="grid-template-columns: repeat(3, minmax(0,1fr))">
    <div class="kpi"><div class="k-label">公海客户</div><div class="k-icon orange">≈</div><div class="k-value">${fmtInt(data.total)}</div><div class="k-sub">待领取客户数量</div></div>
    <div class="kpi"><div class="k-label">默认客保期</div><div class="k-icon blue">⏱</div><div class="k-value">30 <span style="font-size:14px">天</span></div><div class="k-sub">领取后自动计算保护到期日</div></div>
    <div class="kpi"><div class="k-label">客户流转</div><div class="k-icon green">⇄</div><div class="k-value">${fmtInt(data.total)}</div><div class="k-sub">管理员可将公海客户分配给指定业务员</div></div>
  </div>
  <section class="card mt16">
    <div class="toolbar">
      <input class="input grow" id="kw" placeholder="搜索客户名称 / 国家 / 联系人" value="${esc(query.keyword ?? '')}" />
      <span class="muted small">公海规则：超过 90 天未跟进自动回收到公海；领取后 30 天内不可被他人重复跟进</span>
    </div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>客户</th><th>国家 / 行业</th><th>分级</th><th>来源</th><th>建档时间</th><th class="right">海关票数</th><th class="right">跟进记录</th><th></th></tr></thead>
      <tbody>${items.length ? items.map((c) => `
        <tr class="clickable" data-id="${c.id}">
          <td><div class="name"><a href="#/customers/${c.id}">${esc(c.name)}</a></div><div class="secondary">${esc(c.name_en)} · ${esc(c.code)}</div></td>
          <td>${esc(c.country)}<div class="secondary">${esc(c.industry)}</div></td>
          <td>${levelTag(c.level)}</td>
          <td><span class="tag outline">${esc(c.source)}</span></td>
          <td class="muted">${fmtDate(c.created_at)}</td>
          <td class="num">${c.customs_count}</td>
          <td class="num">${c.followup_count}</td>
          <td class="actions"><button class="btn sm" data-assign="${c.id}">分配</button><button class="btn sm primary" data-claim="${c.id}">领取</button></td>
        </tr>`).join('') : `<tr><td colspan="8">${empty('公海暂无客户', '🌊')}</td></tr>`}</tbody>
    </table></div>
  </section>`;

  return { html, bind: () => bindSea(items, opts) };
}

function bindSea(items, opts) {
  const app = document.getElementById('app');
  app.querySelector('#kw')?.addEventListener('input', debounce((e) => {
    const v = e.target.value.trim();
    location.hash = v ? `#/sea?keyword=${encodeURIComponent(v)}` : '#/sea';
  }, 350));
  app.querySelector('#new-customer')?.addEventListener('click', () => openCustomerForm(null, () => location.reload()));
  app.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', (e) => {
    if (e.target.closest('button,a')) return;
    location.hash = `#/customers/${tr.dataset.id}`;
  }));
  app.querySelectorAll('[data-claim]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await api(`/customers/${b.dataset.claim}/claim`, { method: 'POST', body: { protection_days: 30 } });
      toast('领取成功，已获得 30 天客户保护');
      location.reload();
    } catch (e) { toast(e.message, 'err'); }
  }));
  app.querySelectorAll('[data-assign]').forEach((b) => b.addEventListener('click', () => {
    const c = items.find((i) => String(i.id) === b.dataset.assign);
    const root = openModal({
      title: `分配客户 · ${c.name}`,
      body: `<div class="field"><label>分配给</label><select class="input" name="user_id">${opts.users.map((u) => `<option value="${u.id}">${esc(u.name)}（${esc(u.dept)}）</option>`).join('')}</select></div>
        <div class="field mt12"><label>客保天数</label><input class="input" name="protection_days" type="number" value="30" min="1" max="365" /></div>`,
      footer: '<button class="btn" data-close>取消</button><button class="btn primary" id="ok">确认分配</button>',
    });
    root.querySelector('#ok').addEventListener('click', async () => {
      const d = readForm(root);
      try {
        await api(`/customers/${c.id}/claim`, { method: 'POST', body: { user_id: Number(d.user_id), protection_days: Number(d.protection_days) } });
        await api(`/customers/${c.id}/transfer`, { method: 'POST', body: { to_user_id: Number(d.user_id), reason: '管理员从公海分配', auto_accept: true } });
        toast('已分配');
        closeModal();
        location.reload();
      } catch (e) { toast(e.message, 'err'); }
    });
  }));
}
