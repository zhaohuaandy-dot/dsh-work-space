// 客户档案：筛选、表格、新建/编辑客户、客保、公海操作
import { api, avatar, esc, fmtInt, fmtDate, relTime, levelTag, statusTag, empty, openModal, closeModal, readForm, toast, debounce, downloadCsv, daysUntil } from '../util.js';

let optionsCache;

export function getOptions() {
  optionsCache ??= api('/options');
  return optionsCache;
}

const FIELD = (label, inner, full) => `<div class="field ${full ? 'full' : ''}"><label>${label}</label>${inner}</div>`;
const opt = (v, sel) => `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(v)}</option>`;

export async function openCustomerForm(customer, onSaved) {
  const opts = await getOptions();
  const c = customer ?? {};
  const body = `<form id="customer-form" class="form-grid">
    ${FIELD('客户中文名称 <span class="req">*</span>', `<input class="input" name="name" required value="${esc(c.name ?? '')}" placeholder="例如 Rhein 五金公司" />`)}
    ${FIELD('英文名称', `<input class="input" name="name_en" value="${esc(c.name_en ?? '')}" placeholder="Rhein Metalworks GmbH" />`)}
    ${FIELD('国家/地区', `<input class="input" name="country" list="dl-country" value="${esc(c.country ?? '')}" />`)}
    ${FIELD('区域', `<input class="input" name="region" value="${esc(c.region ?? '')}" />`)}
    ${FIELD('行业', `<input class="input" name="industry" list="dl-industry" value="${esc(c.industry ?? '')}" />`)}
    ${FIELD('网站', `<input class="input" name="website" value="${esc(c.website ?? '')}" placeholder="https://" />`)}
    ${FIELD('客户分级', `<select class="input" name="level">${['A', 'B', 'C', 'D'].map((v) => opt(v, c.level ?? 'B')).join('')}</select>`)}
    ${FIELD('线索来源', `<select class="input" name="source">${opts.sources.map((v) => opt(v, c.source ?? '自主开发')).join('')}</select>`)}
    ${FIELD('负责人', `<select class="input" name="owner_id">${opts.users.map((u) => `<option value="${u.id}" ${u.id === (c.owner_id ?? 1) ? 'selected' : ''}>${esc(u.name)}（${esc(u.dept)}）</option>`).join('')}</select>`)}
    ${FIELD('状态', `<select class="input" name="status">${opts.statuses.map((v) => opt(v, c.status ?? '跟进中')).join('')}</select>`)}
    ${FIELD('客保到期日', `<input class="input" type="date" name="protection_until" value="${esc(c.protection_until ?? '')}" /><div class="hint">设置客户保护期，到期前提醒续保</div>`)}
    ${FIELD('统一社会信用号 / Tax ID', `<input class="input" name="tax_id" value="${esc(c.tax_id ?? '')}" />`)}
    ${FIELD('地址', `<input class="input" name="address" value="${esc(c.address ?? '')}" />`, true)}
    ${FIELD('备注', `<textarea class="input" name="remark" rows="2">${esc(c.remark ?? '')}</textarea>`, true)}
    ${customer ? '' : `${FIELD('首个联系人（可选）', `<div class="form-grid"><input class="input" name="contact_name" placeholder="联系人姓名" /><input class="input" name="contact_email" placeholder="邮箱" /></div><div class="hint">保存客户后可在详情页继续添加联系人</div>`, true)}`}
    <datalist id="dl-country">${opts.countries.map((v) => `<option value="${esc(v)}">`).join('')}</datalist>
    <datalist id="dl-industry">${opts.industries.map((v) => `<option value="${esc(v)}">`).join('')}</datalist>
  </form>`;
  const root = openModal({
    title: customer ? `编辑客户 · ${c.name}` : '新建客户',
    body,
    footer: '<button class="btn" data-close>取消</button><button class="btn primary" id="save-customer">保存</button>',
  });
  const form = root.querySelector('#customer-form');
  root.querySelector('#save-customer').addEventListener('click', async () => {
    if (!form.reportValidity()) return;
    const d = readForm(form);
    if (!customer && d.contact_name) d.contacts = [{ name: d.contact_name, email: d.contact_email }];
    delete d.contact_name;
    delete d.contact_email;
    try {
      if (customer) await api(`/customers/${customer.id}`, { method: 'PUT', body: d });
      else await api('/customers', { method: 'POST', body: d });
      toast(customer ? '客户已更新' : '客户已创建');
      closeModal();
      onSaved?.();
    } catch (e) {
      toast(e.message, 'err');
    }
  });
}

export default async function customers({ query, navigate }) {
  const opts = await getOptions();
  const q = {
    keyword: query.keyword ?? '',
    country: query.country ?? '',
    industry: query.industry ?? '',
    level: query.level ?? '',
    status: query.status ?? '',
    source: query.source ?? '',
    owner: query.owner ?? '',
    page: Number(query.page ?? 1),
    size: Number(query.size ?? 15),
  };
  if (query.scope === 'follow') q.scope = 'follow';
  const data = await api('/customers', { query: q });
  const followMode = query.scope === 'follow';
  const totalPages = Math.max(1, Math.ceil(data.total / data.size));

  const row = (c) => {
    const d = daysUntil(c.protection_until);
    const protect = c.status === '公海' ? '<span class="tag gray">—</span>'
      : d === null ? '<span class="tag gray">未设置</span>'
        : d < 0 ? `<span class="tag red">已过期 ${-d} 天</span>`
          : d <= 30 ? `<span class="tag orange">${d} 天后到期</span>`
            : `<span class="tag green">${fmtDate(c.protection_until)}</span>`;
    return `<tr class="clickable" data-id="${c.id}">
      <td><div class="name"><a href="#/customers/${c.id}">${esc(c.name)}</a></div><div class="secondary">${esc(c.name_en)}</div></td>
      <td>${esc(c.country)}<div class="secondary">${esc(c.industry)}</div></td>
      <td>${levelTag(c.level)}</td>
      <td>${statusTag(c.status)}</td>
      <td><span class="tag outline">${esc(c.source)}</span></td>
      <td>${c.owner_name ? `<span class="flex">${avatar(c.owner_name, c.owner_id, 'sm')}<span>${esc(c.owner_name)}</span></span>` : '<span class="muted">未分配</span>'}</td>
      <td class="num">${c.contact_count}</td>
      <td class="num">${c.customs_count}</td>
      <td class="num">${c.followup_count}</td>
      <td>${protect}</td>
      <td class="muted">${relTime(c.last_follow_at)}</td>
      <td class="actions">${c.status === '公海'
        ? `<button class="btn sm primary" data-claim="${c.id}">领取</button>`
        : `<button class="btn sm" data-edit="${c.id}">编辑</button><button class="btn sm" data-release="${c.id}">放入公海</button>`}</td>
    </tr>`;
  };

  const chips = (list, key, cur) => list.map((v) => `<button class="chip ${String(cur) === String(v.value) ? 'on' : ''}" data-filter="${key}" data-value="${esc(v.value)}">${esc(v.label)}</button>`).join('');

  const html = `
  <div class="page-head">
    <div><h1>${followMode ? '客户跟进' : query.source === '海关数据' ? '海关客户池' : '客户档案'}</h1>
      <p>${followMode ? '以业务时间轴追溯历史跟进、报价与海关记录，还原商务过程' : '以客户为中心，基础信息、跟进动态、海关交易与商机自动归档'}</p></div>
    <div class="spacer"></div>
    <button class="btn" id="data-tools">数据管理</button>
    <button class="btn" id="import-csv">导入 CSV</button>
    <button class="btn" id="export-csv">导出 CSV</button>
    <button class="btn primary" id="new-customer">+ 新建客户</button>
  </div>

  <section class="card">
    <div class="toolbar">
      <input class="input grow" id="kw" placeholder="搜索客户名称 / 英文名 / 编码 / 联系人 / 邮箱" value="${esc(q.keyword)}" />
      <select class="input" id="f-country"><option value="">全部国家</option>${opts.countries.map((v) => opt(v, q.country)).join('')}</select>
      <select class="input" id="f-industry"><option value="">全部行业</option>${opts.industries.map((v) => opt(v, q.industry)).join('')}</select>
      <select class="input" id="f-status"><option value="">全部状态</option>${opts.statuses.map((v) => opt(v, q.status)).join('')}</select>
      <select class="input" id="f-owner"><option value="">全部负责人</option>${opts.users.map((u) => `<option value="${u.id}" ${String(u.id) === String(q.owner) ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>
      <button class="btn ghost" id="reset">重置</button>
    </div>
    <div class="toolbar">
      <span class="muted small">客户分级</span>
      ${chips([{ value: '', label: '全部' }, ...['A', 'B', 'C', 'D'].map((v) => ({ value: v, label: `${v} 级` }))], 'level', q.level)}
      <span class="muted small" style="margin-left:12px">来源</span>
      ${chips([{ value: '', label: '全部' }, ...opts.sources.map((v) => ({ value: v, label: v }))], 'source', q.source)}
    </div>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>客户</th><th>国家 / 行业</th><th>分级</th><th>状态</th><th>来源</th><th>负责人</th><th class="right">联系人</th><th class="right">海关</th><th class="right">跟进</th><th>客保到期</th><th>最近跟进</th><th></th></tr></thead>
        <tbody>${data.items.length ? data.items.map(row).join('') : `<tr><td colspan="12">${empty('没有符合条件的客户')}</td></tr>`}</tbody>
      </table>
    </div>
    <div class="pager">
      <span>共 <b>${fmtInt(data.total)}</b> 个客户 · 第 ${data.page}/${totalPages} 页</span>
      <div class="spacer"></div>
      <button class="btn sm" data-page="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''}>上一页</button>
      <button class="btn sm" data-page="${data.page + 1}" ${data.page >= totalPages ? 'disabled' : ''}>下一页</button>
    </div>
  </section>`;

  return { html, bind: () => bindCustomersPage(query, data, followMode) };
}

function bindCustomersPage(origQuery, data, followMode) {
  const app = document.getElementById('app');
  const setQuery = (patch) => {
    const q = { ...origQuery, ...patch, page: patch.page ?? 1 };
    for (const k of Object.keys(q)) if (q[k] === '' || q[k] === undefined) delete q[k];
    location.hash = `#/customers?${new URLSearchParams(q)}`;
  };
  app.querySelector('#new-customer')?.addEventListener('click', () => openCustomerForm(null, () => location.reload()));
  app.querySelector('#import-csv')?.addEventListener('click', () => {
    import('./dataTools.js').then((m) => m.openImport('customers', () => location.reload()));
  });
  app.querySelector('#data-tools')?.addEventListener('click', () => {
    import('./dataTools.js').then((m) => m.openDataTools(() => location.reload()));
  });
  app.querySelector('#kw')?.addEventListener('input', debounce((e) => setQuery({ keyword: e.target.value }), 350));
  app.querySelector('#f-country')?.addEventListener('change', (e) => setQuery({ country: e.target.value }));
  app.querySelector('#f-industry')?.addEventListener('change', (e) => setQuery({ industry: e.target.value }));
  app.querySelector('#f-status')?.addEventListener('change', (e) => setQuery({ status: e.target.value }));
  app.querySelector('#f-owner')?.addEventListener('change', (e) => setQuery({ owner: e.target.value }));
  app.querySelector('#reset')?.addEventListener('click', () => {
    location.hash = followMode ? '#/customers?scope=follow' : '#/customers';
  });
  app.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => setQuery({ [b.dataset.filter]: b.dataset.value })));
  app.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => setQuery({ page: Number(b.dataset.page) })));
  app.querySelector('#export-csv')?.addEventListener('click', () => {
    const rows = [['编码', '客户名称', '英文名', '国家', '行业', '分级', '状态', '来源', '负责人', '客保到期', '联系人', '海关票数', '跟进次数']];
    for (const c of data.items) rows.push([c.code, c.name, c.name_en, c.country, c.industry, c.level, c.status, c.source, c.owner_name ?? '', c.protection_until ?? '', c.contact_count, c.customs_count, c.followup_count]);
    downloadCsv('客户档案.csv', rows);
  });
  app.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', (e) => {
    if (e.target.closest('button,a')) return;
    location.hash = `#/customers/${tr.dataset.id}`;
  }));
  app.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async (e) => {
    e.stopPropagation();
    const c = data.items.find((i) => String(i.id) === b.dataset.edit);
    await openCustomerForm(c, () => location.reload());
  }));
  app.querySelectorAll('[data-release]').forEach((b) => b.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm('确定将该客户放入公海？放入后其他同事可领取。')) return;
    try {
      await api(`/customers/${b.dataset.release}/release`, { method: 'POST', body: {} });
      toast('已放入公海');
      location.reload();
    } catch (err) { toast(err.message, 'err'); }
  }));
  app.querySelectorAll('[data-claim]').forEach((b) => b.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await api(`/customers/${b.dataset.claim}/claim`, { method: 'POST', body: { protection_days: 30 } });
      toast('领取成功，已获得 30 天客户保护');
      location.reload();
    } catch (err) { toast(err.message, 'err'); }
  }));
}
