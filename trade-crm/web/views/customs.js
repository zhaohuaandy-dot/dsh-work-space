// 海关数据分析：数据概览、贸易走势、采购商排名（含潜在买家）、国家 / 商品 / 出口商分布、原始记录与一键建档
import { api, esc, fmtDate, fmtInt, fmtMoney, fmtNum, fmtUsd, empty, svgLine, toast, debounce, openModal, closeModal, readForm, downloadCsv, userColor } from '../util.js';
import { getOptions } from './customers.js';

const COUNTRY_COLORS = ['#1c5fd8', '#f08c1a', '#12a16b', '#7b5cd6', '#e0483f', '#0e9aa7', '#c2a400', '#8a93a6'];

export default async function customs({ query }) {
  const opts = await getOptions();
  const [a, list] = await Promise.all([
    api('/customs/analysis', { query: { keyword: query.keyword, country: query.country } }),
    api('/customs', { query: { customer_id: query.customer, size: 12 } }),
  ]);
  const s = a.summary;
  const countryItems = a.byCountry.filter((c) => c.name !== '中国');
  const maxCountry = Math.max(1, ...countryItems.map((c) => c.amount));
  const monthPoints = a.byMonth.map((m) => ({ x: m.month.slice(2), y: m.amount }));
  const maxImporter = Math.max(1, ...a.importers.map((i) => i.amount));
  const buyerTotal = a.importers.reduce((t, i) => t + i.amount, 0) || 1;
  const topFive = a.importers.slice(0, 5).reduce((t, i) => t + i.amount, 0);
  const restShare = Math.max(0, Math.round((1 - topFive / buyerTotal) * 1000) / 10);

  const html = `
  <div class="page-head">
    <div><h1>海关数据分析</h1><p>从海关进出口数据洞察买家采购行为，发现未建档的潜在客户并一键建档</p></div>
    <div class="spacer"></div>
    <input class="input" id="kw" placeholder="搜索采购商 / 商品 / HS 编码" style="width:240px" value="${esc(query.keyword ?? '')}" />
    <select class="input" id="f-country" style="width:120px"><option value="">全部国家</option>${opts.countries.map((c) => `<option ${c === query.country ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <button class="btn" id="import-customs">导入海关数据</button>
    <button class="btn" id="export">导出</button>
  </div>

  <div class="kpis" style="grid-template-columns: repeat(4, minmax(0,1fr))">
    <div class="kpi"><div class="k-label">海关交易总额</div><div class="k-icon orange">◎</div><div class="k-value">${fmtMoney(s.amount)}</div><div class="k-sub">${fmtInt(s.shipments)} 票提单 · 更新至 ${fmtDate(a.byMonth.at(-1)?.month ?? '')}</div></div>
    <div class="kpi"><div class="k-label">总货运量</div><div class="k-icon blue">⚓</div><div class="k-value">${fmtNum(s.teu)} <span style="font-size:13px">TEU</span></div><div class="k-sub">约 ${fmtInt(s.weight)} 吨 · ${s.countries} 个贸易国家</div></div>
    <div class="kpi"><div class="k-label">覆盖商品</div><div class="k-icon green">◫</div><div class="k-value">${s.hs_codes}</div><div class="k-sub">个 HS 编码商品品类</div></div>
    <div class="kpi"><div class="k-label">未建档采购商</div><div class="k-icon purple">✧</div><div class="k-value">${a.potentials.length}</div><div class="k-sub">可一键转为客户档案</div></div>
  </div>

  <section class="card mt16">
    <div class="card-head"><h2>贸易走势</h2><span class="sub">按月汇总交易金额</span><div class="spacer"></div>
      <div class="legend"><span><i style="background:#1c5fd8"></i>交易金额</span></div></div>
    <div class="card-body">${monthPoints.length ? svgLine([{ name: '金额', color: '#1c5fd8', points: monthPoints }], { height: 210, width: 1100 }) : empty('暂无数据')}</div>
  </section>

  <div class="grid mt16" style="grid-template-columns: minmax(0,1.55fr) minmax(0,1fr)">
    <section class="card">
      <div class="card-head"><h2>采购商排名</h2><span class="sub">交易金额 TOP 12 · 头部 5 家占比 ${fmtNum(100 - restShare)}%</span><div class="spacer"></div><span class="muted small">点击公司名筛选</span></div>
      <div class="card-body flush">
        <div class="bars" style="padding:14px 16px;gap:6px">
          <div class="bar-row" style="grid-template-columns:22px 1fr 120px 70px;font-size:11px;color:var(--ink-3)"><span>#</span><span>采购商</span><span class="right">交易金额</span><span class="right">状态</span></div>
          ${a.importers.map((i, idx) => `
            <div class="bar-row" style="grid-template-columns:22px 1fr 120px 70px;cursor:pointer" data-kw="${esc(i.name)}">
              <span class="muted num">${idx + 1}</span>
              <div style="min-width:0"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(i.name)}">${esc(i.name)} <span class="muted small">${esc(i.country)}</span></div>
                <div class="bar-track"><div class="bar-fill" style="width:${(i.amount / maxImporter) * 100}%"></div></div></div>
              <span class="right num">${fmtMoney(i.amount)}<div class="muted small">${i.shipments} 票</div></span>
              <span class="right">${i.potential ? '<span class="tag orange">未建档</span>' : `<span class="tag green">${esc(i.customer_code ?? '已建档')}</span>`}</span>
            </div>`).join('')}
        </div>
      </div>
    </section>
    <section class="card">
      <div class="card-head"><h2>贸易监测</h2><span class="sub">近 90 天到港潜在买家</span></div>
      <div class="card-body"><div style="display:grid;gap:12px">
        ${a.alerts.map((x) => `
          <div class="flex" style="align-items:flex-start">
            <span class="avatar" style="background:${userColor(x.importer.length)}">${esc(x.importer.slice(0, 1))}</span>
            <div style="flex:1;min-width:0">
              <div><b>${esc(x.importer)}</b> <span class="muted small">${esc(x.importer_country)}</span></div>
              <div class="small muted">${esc(x.product)} · HS ${esc(x.hs_code)} · ${fmtDate(x.shipment_date)} 到港</div>
              <div class="small money">${fmtUsd(x.amount_usd)}</div>
            </div>
            <button class="btn sm" data-convert="${esc(x.importer)}|${esc(x.importer_country)}|${x.id}">建档</button>
          </div>`).join('') || empty('暂无提醒')}
      </div></div>
    </section>
  </div>

  <div class="grid mt16" style="grid-template-columns: minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)">
    <section class="card">
      <div class="card-head"><h2>进口国分布</h2></div>
      <div class="card-body"><div class="bars">
        ${countryItems.slice(0, 8).map((c, i) => `
          <div class="bar-row">
            <span>${esc(c.name)}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${(c.amount / maxCountry) * 100}%;background:${COUNTRY_COLORS[i % COUNTRY_COLORS.length]}"></div></div>
            <span class="right num">${fmtMoney(c.amount)}</span>
          </div>`).join('')}
      </div></div>
    </section>
    <section class="card">
      <div class="card-head"><h2>商品排行</h2><span class="sub">HS 编码</span></div>
      <div class="card-body"><div class="bars">
        ${a.byProduct.map((p) => `
          <div class="bar-row">
            <span title="${esc(p.name)}">${esc(p.name)}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${(p.amount / Math.max(1, a.byProduct[0].amount)) * 100}%"></div></div>
            <span class="right num">${fmtMoney(p.amount)}</span>
          </div>`).join('')}
      </div></div>
    </section>
    <section class="card">
      <div class="card-head"><h2>同行出口商</h2><span class="sub">竞争情报</span></div>
      <div class="card-body"><div class="bars">
        ${a.byExporter.map((p) => `
          <div class="bar-row">
            <span title="${esc(p.name)}">${esc(p.name)}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${(p.amount / Math.max(1, a.byExporter[0].amount)) * 100}%;background:#7b5cd6"></div></div>
            <span class="right num">${fmtMoney(p.amount)}</span>
          </div>`).join('')}
      </div></div>
    </section>
  </div>

  <section class="card mt16">
    <div class="card-head"><h2>海关交易明细</h2><span class="sub">${query.customer ? '当前客户的历史交易' : '最新提单记录'}</span><div class="spacer"></div>${query.customer ? '<a class="btn ghost sm" href="#/customs">查看全部</a>' : ''}</div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>到港日期</th><th>采购商</th><th>国家</th><th>商品</th><th>HS 编码</th><th class="right">TEU</th><th class="right">金额</th><th>承运</th><th>客户档案</th></tr></thead>
      <tbody>${list.items.map((r) => `
        <tr><td class="muted">${fmtDate(r.shipment_date)}</td><td class="name">${esc(r.importer)}</td><td>${esc(r.importer_country)}</td>
        <td>${esc(r.product)}</td><td class="muted">${esc(r.hs_code)}</td><td class="num">${r.teu}</td><td class="num">${fmtUsd(r.amount_usd)}</td>
        <td class="muted">${esc(r.carrier)}</td>
        <td>${r.customer_id ? `<a href="#/customers/${r.customer_id}">${esc(r.customer_name)}</a>` : '<span class="tag orange">未建档</span>'}</td></tr>`).join('') || `<tr><td colspan="9">${empty('暂无记录')}</td></tr>`}</tbody>
    </table></div>
  </section>`;

  return { html, bind: () => bindCustoms(query, list) };
}

function bindCustoms(query, list) {
  const app = document.getElementById('app');
  const reloadWith = (patch) => {
    const q = { ...query, ...patch };
    for (const k of Object.keys(q)) if (!q[k]) delete q[k];
    location.hash = `#/customs?${new URLSearchParams(q)}`;
  };
  app.querySelector('#kw')?.addEventListener('input', debounce((e) => reloadWith({ keyword: e.target.value.trim() }), 400));
  app.querySelector('#f-country')?.addEventListener('change', (e) => reloadWith({ country: e.target.value }));
  app.querySelector('#import-customs')?.addEventListener('click', () => {
    import('./dataTools.js').then((m) => m.openImport('customs', () => location.reload()));
  });
  app.querySelector('#export')?.addEventListener('click', () => {
    const rows = [['到港日期', '采购商', '国家', '商品', 'HS 编码', 'TEU', '金额USD', '承运', '客户档案']];
    for (const r of list.items) rows.push([r.shipment_date, r.importer, r.importer_country, r.product, r.hs_code, r.teu, r.amount_usd, r.carrier, r.customer_name ?? '未建档']);
    downloadCsv('海关交易明细.csv', rows);
  });
  app.querySelectorAll('[data-kw]').forEach((el) => el.addEventListener('click', () => {
    location.hash = `#/customs?keyword=${encodeURIComponent(el.dataset.kw)}`;
  }));
  app.querySelectorAll('[data-convert]').forEach((b) => b.addEventListener('click', () => {
    const [importer, country, customsId] = b.dataset.convert.split('|');
    const root = openModal({
      title: `建档 · ${importer}`,
      body: `<div class="note">该采购商来自海关数据。确认后自动创建客户档案，并把该采购商的历史提单归到新客户名下。</div>
        <form id="cv" class="form-grid mt12">
          <div class="field"><label>采购商英文名</label><input class="input" name="importer" value="${esc(importer)}" /></div>
          <div class="field"><label>国家</label><input class="input" name="country" value="${esc(country)}" /></div>
          <div class="field"><label>客户分级</label><select class="input" name="level"><option>B</option><option>A</option><option>C</option></select></div>
          <div class="field"><label>负责人</label><select class="input" name="owner_id"><option value="1">当前用户（王芳）</option><option value="2">李强</option><option value="3">张敏</option></select></div>
        </form>`,
      footer: '<button class="btn" data-close>取消</button><button class="btn primary" id="ok">创建客户档案</button>',
    });
    root.querySelector('#ok').addEventListener('click', async () => {
      const d = readForm(root.querySelector('#cv'));
      try {
        const r = await api('/customs/convert', { method: 'POST', body: { ...d, customs_id: Number(customsId) } });
        toast(`已创建客户 ${r.code}`);
        closeModal();
        location.hash = `#/customers/${r.id}`;
      } catch (e) { toast(e.message, 'err'); }
    });
  }));
}
