// 工作看板：核心指标、销售漏斗、海关数据概览、客户分级、重点客户与近期跟进
import { api, avatar, esc, fmtInt, fmtMoney, fmtDate, fmtUsd, relTime, levelTag, statusTag, svgLine, svgBars, svgDonut, empty, progressBar, openModal, closeModal, readForm, toast } from '../util.js';

const LEVEL_COLORS = { A: '#e0483f', B: '#f08c1a', C: '#1c5fd8', D: '#8a93a6' };
const STATUS_COLORS = { 跟进中: '#1c5fd8', 已成交: '#12a16b', 公海: '#f08c1a', 已流失: '#8a93a6' };

export default async function dashboard({ navigate }) {
  const [s, customs, customers, opps, activity] = await Promise.all([
    api('/stats'),
    api('/customs/analysis'),
    api('/customers', { query: { size: 6 } }),
    api('/opportunities'),
    api('/activities'),
  ]);
  const recentFollow = await api('/customers', { query: { size: 60 } });

  const kpi = (label, value, sub, icon, cls) => `
    <div class="kpi">
      <div class="k-label">${esc(label)}</div>
      <div class="k-icon ${cls}">${icon}</div>
      <div class="k-value">${value}</div>
      <div class="k-sub">${sub}</div>
    </div>`;

  const funnel = opps.pipeline.filter((p) => p.stage !== '输单');
  const maxFunnel = Math.max(1, ...funnel.map((f) => f.amount));
  const funnelHtml = funnel.map((f) => `
    <div class="bar-row" style="grid-template-columns:64px 1fr 136px">
      <span>${esc(f.stage)}</span>
      <div class="bar-track" style="height:12px"><div class="bar-fill" style="width:${(f.amount / maxFunnel) * 100}%"></div></div>
      <span class="right num">${fmtMoney(f.amount)} <span class="muted small">· ${f.count} 个</span></span>
    </div>`).join('');

  const levelItems = s.byLevel.map((l) => ({ name: `${l.level} 级`, value: l.c, color: LEVEL_COLORS[l.level] ?? '#8a93a6' }));
  const statusItems = s.byStatus.map((l) => ({ name: l.status, value: l.c, color: STATUS_COLORS[l.status] ?? '#8a93a6' }));
  const trendPoints = s.trend.map((t) => ({ x: t.month.slice(5) + '月', y: t.c }));
  const countryBars = s.byCountry.filter((c) => c.name !== '中国').slice(0, 7).map((c) => ({ name: c.name, value: c.amount }));
  const winRate = s.opportunities.won + s.opportunities.lost ? Math.round((s.opportunities.won / (s.opportunities.won + s.opportunities.lost)) * 100) : 0;

  // 客户经理业绩：按归属客户统计，商机金额来自机会列表
  const owners = new Map();
  for (const c of recentFollow.items) {
    if (!c.owner_id) continue;
    const o = owners.get(c.owner_id) ?? { id: c.owner_id, name: c.owner_name, customers: 0, amount: 0 };
    o.customers++;
    owners.set(c.owner_id, o);
  }
  for (const op of opps.items) {
    if (!op.owner_id || !owners.has(op.owner_id)) continue;
    owners.get(op.owner_id).amount += op.amount_usd;
  }
  const ownerRows = [...owners.values()].sort((a, b) => b.amount - a.amount);
  const maxAmount = Math.max(1, ...ownerRows.map((o) => o.amount));

  const recent = recentFollow.items
    .filter((c) => c.last_follow_at)
    .sort((a, b) => String(b.last_follow_at).localeCompare(String(a.last_follow_at)))
    .slice(0, 5);

  return `
  <div class="page-head">
    <div>
      <h1>工作看板</h1>
      <p>销售全流程概览 · 数据更新于 ${new Date().toLocaleString('zh-CN', { hour12: false })}</p>
    </div>
    <div class="spacer"></div>
    <button class="btn" data-go="#/customs">海关数据分析</button>
    <button class="btn" data-data-tools>数据管理</button>
    <button class="btn primary" data-new-customer>+ 新建客户</button>
  </div>

  ${s.customers.total === 0 ? `<div class="card mb16" style="border-color:#cfe0fb;background:var(--brand-soft)">
    <div class="card-body">
      <h2 style="color:#1d4f9e">开始录入你自己的数据</h2>
      <p class="small" style="color:#1d4f9e;margin:6px 0 10px">当前库里没有客户。可以先用 CSV 把你的客户表和海关提单导进来（支持 Excel 另存的 CSV）。</p>
      <button class="btn primary" data-import-customers>导入客户 CSV</button>
      <button class="btn" data-go="#/customs" style="margin-left:8px">导入海关数据</button>
    </div>
  </div>` : ''}

  <div class="kpis">
    ${kpi('客户总数', fmtInt(s.customers.total), `跟进中 <b>${s.customers.active}</b> · 已成交 <b>${s.customers.won}</b> · 公海 <b>${s.customers.sea}</b>`, '◉', 'blue')}
    ${kpi('本月跟进', fmtInt(s.customers.followMonth), `30 天内客保到期 <b>${s.customers.dueProtect}</b> 个`, '✎', 'green')}
    ${kpi('进行中商机', fmtInt(s.opportunities.open), `预计金额 <b>${fmtMoney(s.opportunities.openAmount)}</b> · 赢单率 ${winRate}%`, '◇', 'purple')}
    ${kpi('海关交易额', fmtMoney(s.customs.amount), `${fmtInt(s.customs.shipments)} 票 · ${fmtInt(s.customs.teu)} TEU`, '◎', 'orange')}
    ${kpi('营销触达', fmtInt(s.activities.sent), `进行中活动 <b>${s.activities.running}</b> · 打开 <b>${s.activities.opened}</b> · 回复 <b>${s.activities.replied}</b>`, '✉', 'red')}
  </div>

  <div class="grid mt16" style="grid-template-columns: minmax(0,1.5fr) minmax(0,1fr)">
    <section class="card">
      <div class="card-head"><h2>销售漏斗</h2><span class="sub">按商机阶段汇总预计金额</span><div class="spacer"></div><a href="#/opportunities" class="btn ghost sm">商机看板 →</a></div>
      <div class="card-body"><div class="bars">${funnelHtml || empty('暂无商机')}</div></div>
    </section>
    <section class="card">
      <div class="card-head"><h2>客户分级</h2><span class="sub">A/B/C/D 客户价值分层</span></div>
      <div class="card-body">${svgDonut(levelItems)}</div>
    </section>
  </div>

  <div class="grid mt16" style="grid-template-columns: minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)">
    <section class="card">
      <div class="card-head"><h2>新增客户趋势</h2><span class="sub">近 6 个月</span></div>
      <div class="card-body">${trendPoints.length ? svgLine([{ name: '新增', color: '#1c5fd8', points: trendPoints }], { height: 170, width: 380 }) : empty('暂无数据')}</div>
    </section>
    <section class="card">
      <div class="card-head"><h2>客户状态</h2></div>
      <div class="card-body">${svgDonut(statusItems)}</div>
    </section>
    <section class="card">
      <div class="card-head"><h2>海关进口国 TOP</h2><span class="sub">交易金额</span></div>
      <div class="card-body">${svgBars(countryBars, { color: '#f08c1a' })}</div>
    </section>
  </div>

  <div class="grid mt16" style="grid-template-columns: minmax(0,1.35fr) minmax(0,1fr)">
    <section class="card">
      <div class="card-head"><h2>贸易监测</h2><span class="sub">近 90 天到港、尚未建档的采购商</span><div class="spacer"></div><a href="#/customs" class="btn ghost sm">全部 →</a></div>
      <div class="card-body flush"><div class="table-wrap"><table class="table">
        <thead><tr><th>采购商</th><th>国家</th><th>主要商品</th><th>贸易额</th><th>最近到港</th></tr></thead>
        <tbody>${customs.alerts.map((a) => `
          <tr><td class="name">${esc(a.importer)}</td><td>${esc(a.importer_country)}</td>
          <td class="muted">${esc(a.product)} <span class="secondary">${esc(a.hs_code)}</span></td>
          <td class="num">${fmtUsd(a.amount_usd)}</td><td class="muted">${fmtDate(a.shipment_date)}</td></tr>`).join('') || `<tr><td colspan="5">${empty('暂无提醒')}</td></tr>`}</tbody>
      </table></div></div>
    </section>
    <section class="card">
      <div class="card-head"><h2>最近新增客户</h2><div class="spacer"></div><a href="#/customers" class="btn ghost sm">全部 →</a></div>
      <div class="card-body flush"><div class="table-wrap"><table class="table">
        <thead><tr><th>客户</th><th>等级</th><th>归属</th><th>最近跟进</th></tr></thead>
        <tbody>${customers.items.map((c) => `
          <tr class="clickable" data-go="#/customers/${c.id}">
            <td><div class="name"><a href="#/customers/${c.id}">${esc(c.name)}</a></div><div class="secondary">${esc(c.name_en)} · ${esc(c.country)}</div></td>
            <td>${levelTag(c.level)}</td>
            <td>${c.owner_name ? `<span class="flex">${avatar(c.owner_name, c.owner_id, 'sm')}<span>${esc(c.owner_name)}</span></span>` : '<span class="tag orange">公海</span>'}</td>
            <td class="muted">${relTime(c.last_follow_at)}</td>
          </tr>`).join('')}</tbody>
      </table></div></div>
    </section>
  </div>

  <div class="grid mt16" style="grid-template-columns: minmax(0,1fr) minmax(0,1fr)">
    <section class="card">
      <div class="card-head"><h2>最近跟进动态</h2><div class="spacer"></div><a href="#/customers?scope=follow" class="btn ghost sm">跟进记录 →</a></div>
      <div class="card-body"><div class="timeline">
        ${recent.map((c) => `
          <div class="timeline-item">
            <div class="t-head"><span class="tag blue">${esc(c.source)}</span><b>${esc(c.name)}</b><span>${esc(c.country)} · ${esc(c.industry)}</span><span>·</span><span>${relTime(c.last_follow_at)}</span></div>
            <div class="t-body"><a href="#/customers/${c.id}">${statusTag(c.status)} ${levelTag(c.level)}</a> 跟进 ${c.followup_count} 次 · 海关记录 ${c.customs_count} 票</div>
          </div>`).join('') || empty('暂无跟进')}
      </div></div>
    </section>
    <section class="card">
      <div class="card-head"><h2>客户经理业绩</h2><span class="sub">归属客户 · 商机金额</span></div>
      <div class="card-body"><div class="rank">
        ${ownerRows.map((o, i) => `
          <div class="rank-row">
            <span class="no">${i + 1}</span>
            <div>${avatar(o.name, o.id, 'sm')} <b>${esc(o.name)}</b> <span class="muted small">${o.customers} 个客户</span>
              <div class="progress mt8"><i style="width:${(o.amount / maxAmount) * 100}%"></i></div></div>
            <span class="right num small">${fmtMoney(o.amount)}</span>
          </div>`).join('') || empty('暂无数据')}
      </div></div>
    </section>
  </div>`;
}
