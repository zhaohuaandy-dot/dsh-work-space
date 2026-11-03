// 邮件营销：活动列表、目标客户漏斗、推进发送、打开/回复透视
import { api, esc, fmtDate, fmtInt, fmtNum, empty, toast, openModal, closeModal, readForm, svgDonut } from '../util.js';
import { getOptions } from './customers.js';

const STATUS_COLOR = { 待发送: '#c2cad8', 已发送: '#1c5fd8', 已打开: '#7b5cd6', 已回复: '#12a16b' };

export default async function activities({ query }) {
  const [data, opts] = await Promise.all([api('/activities'), getOptions()]);
  const items = data.items;
  const selected = query.id ? await api(`/activities/${query.id}`) : null;
  const customers = await api('/customers', { query: { size: 100 } });

  const totalSent = items.reduce((a, b) => a + b.sent_count, 0);
  const totalOpen = items.reduce((a, b) => a + b.open_count, 0);
  const totalReply = items.reduce((a, b) => a + b.reply_count, 0);

  const detail = selected ? (() => {
    const a = selected.activity;
    const c = selected.counts;
    const donut = ['待发送', '已发送', '已打开', '已回复'].filter((s) => c[s]).map((s) => ({ name: s, value: c[s], color: STATUS_COLOR[s] }));
    const total = selected.targets.length || 1;
    return `<section class="card mt16">
      <div class="card-head"><h2>${esc(a.name)}</h2><span class="tag blue">${esc(a.kind)}</span><span class="tag ${a.status === '已完成' ? 'green' : a.status === '已暂停' ? 'gray' : 'orange'}">${esc(a.status)}</span>
        <div class="spacer"></div>
        <button class="btn" data-advance="${a.id}">推进发送</button>
        <button class="btn ghost" data-add-targets="${a.id}">添加目标客户</button>
      </div>
      <div class="card-body">
        <div class="split" style="grid-template-columns: 260px 1fr; gap: 20px">
          <div>${svgDonut(donut)}</div>
          <div class="bars" style="align-content:start">
            ${['待发送', '已发送', '已打开', '已回复'].map((s) => `
              <div class="bar-row" style="grid-template-columns:64px 1fr 110px">
                <span>${s}</span>
                <div class="bar-track"><div class="bar-fill" style="width:${((c[s] ?? 0) / total) * 100}%;background:${STATUS_COLOR[s]}"></div></div>
                <span class="right num">${c[s] ?? 0} <span class="muted small">· ${Math.round(((c[s] ?? 0) / total) * 100)}%</span></span>
              </div>`).join('')}
            <div class="note mt12">千里眼：已发邮件的打开 / 回复状态实时回写客户档案，透视营销结果。</div>
          </div>
        </div>
        <div class="table-wrap mt16"><table class="table">
          <thead><tr><th>客户</th><th>国家</th><th>邮箱状态</th><th>更新时间</th></tr></thead>
          <tbody>${selected.targets.map((t) => `<tr>
            <td class="name"><a href="#/customers/${t.customer_id}">${esc(t.customer_name)}</a><div class="secondary">${esc(t.name_en)}</div></td>
            <td>${esc(t.country)}</td>
            <td><span class="tag" style="background:${STATUS_COLOR[t.status]}22;color:${STATUS_COLOR[t.status]}">${esc(t.status)}</span></td>
            <td class="muted">${fmtDate(t.updated_at)}</td></tr>`).join('')}</tbody>
        </table></div>
      </div>
    </section>`;
  })() : '';

  const html = `
  <div class="page-head">
    <div><h1>邮件营销</h1><p>营销活动管理 · 一对一式群发单显 · 邮件打开与回复追踪（千里眼）</p></div>
    <div class="spacer"></div>
    <button class="btn primary" id="new-act">+ 新建营销活动</button>
  </div>
  <div class="kpis">
    <div class="kpi"><div class="k-label">营销活动</div><div class="k-icon blue">✉</div><div class="k-value">${items.length}</div><div class="k-sub">进行中 ${items.filter((i) => i.status === '进行中').length}</div></div>
    <div class="kpi"><div class="k-label">已发送</div><div class="k-icon purple">➤</div><div class="k-value">${fmtInt(totalSent)}</div><div class="k-sub">封开发信</div></div>
    <div class="kpi"><div class="k-label">打开率</div><div class="k-icon orange">👁</div><div class="k-value">${totalSent ? fmtNum((totalOpen / totalSent) * 100) : 0}%</div><div class="k-sub">${fmtInt(totalOpen)} 次打开</div></div>
    <div class="kpi"><div class="k-label">回复率</div><div class="k-icon green">↩</div><div class="k-value">${totalSent ? fmtNum((totalReply / totalSent) * 100) : 0}%</div><div class="k-sub">${fmtInt(totalReply)} 个回复</div></div>
    <div class="kpi"><div class="k-label">目标客户</div><div class="k-icon red">◎</div><div class="k-value">${fmtInt(items.reduce((a, b) => a + b.target_count, 0))}</div><div class="k-sub">覆盖客户数</div></div>
  </div>
  <section class="card mt16">
    <div class="card-head"><h2>活动列表</h2></div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>活动名称</th><th>类型</th><th>状态</th><th>周期</th><th>负责人</th><th style="width:200px">发送进度</th><th class="right">打开率</th><th class="right">回复率</th><th></th></tr></thead>
      <tbody>${items.map((a) => `<tr class="clickable" data-act="${a.id}">
        <td class="name">${esc(a.name)}</td>
        <td><span class="tag outline">${esc(a.kind)}</span></td>
        <td><span class="tag ${a.status === '已完成' ? 'green' : a.status === '已暂停' ? 'gray' : 'orange'}">${esc(a.status)}</span></td>
        <td class="muted small">${fmtDate(a.start_date)} ~ ${fmtDate(a.end_date)}</td>
        <td>${esc(a.owner_name ?? '—')}</td>
        <td><div class="progress"><i style="width:${a.target_count ? Math.min(100, (a.sent_count / a.target_count) * 100) : 0}%"></i></div>
          <div class="small muted mt8">${a.sent_count} / ${a.target_count}</div></td>
        <td class="right num">${a.open_rate}%</td>
        <td class="right num">${a.reply_rate}%</td>
        <td class="actions"><button class="btn sm" data-advance="${a.id}">推进发送</button></td>
      </tr>`).join('') || `<tr><td colspan="9">${empty('暂无活动')}</td></tr>`}</tbody>
    </table></div>
  </section>
  ${detail}`;

  return { html, bind: () => bindActivities(customers) };
}

function bindActivities(customers) {
  {
    const app = document.getElementById('app');
    app.querySelector('#new-act')?.addEventListener('click', () => {
      const root = openModal({
        title: '新建营销活动',
        body: `<form id="na" class="form-grid">
          <div class="field full"><label>活动名称 <span class="req">*</span></label><input class="input" name="name" placeholder="例如：Q1 中东市场开发信" /></div>
          <div class="field"><label>类型</label><select class="input" name="kind">${['邮件营销', '展会', '社媒营销', 'EDM群发'].map((k) => `<option>${k}</option>`).join('')}</select></div>
          <div class="field"><label>结束日期</label><input class="input" type="date" name="end_date" /></div>
          <div class="field full"><label>选择目标客户（按住 Ctrl / ⌘ 多选）</label>
            <select class="input" name="customer_ids" multiple size="8" style="height:auto">
              ${customers.items.map((c) => `<option value="${c.id}">${esc(c.name)} · ${esc(c.country)} · ${esc(c.level)} 级</option>`).join('')}
            </select></div>
        </form>`,
        footer: `<button class="btn" data-close>取消</button><button class="btn primary" id="ok">创建</button>`,
      });
      root.querySelector('#ok').addEventListener('click', async () => {
        const form = root.querySelector('#na');
        if (!form.reportValidity()) return;
        const d = readForm(form);
        const customer_ids = [...form.querySelector('select[name=customer_ids]').selectedOptions].map((o) => Number(o.value));
        try {
          const r = await api('/activities', { method: 'POST', body: { name: d.name, kind: d.kind, end_date: d.end_date, customer_ids } });
          toast('营销活动已创建');
          closeModal();
          location.hash = `#/activities?id=${r.id}`;
          location.reload();
        } catch (e) { toast(e.message, 'err'); }
      });
    });
    app.querySelectorAll('tr[data-act]').forEach((tr) => tr.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      location.hash = `#/activities?id=${tr.dataset.act}`;
    }));
    app.querySelectorAll('[data-advance]').forEach((b) => b.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const r = await api(`/activities/${b.dataset.advance}/advance`, { method: 'POST', body: {} });
        const moved = ['待发送', '已发送', '已打开'].filter((s) => r.counts[s]).length;
        toast(moved ? '已推进一轮发送 / 打开 / 回复状态' : '活动已全部完成');
        location.reload();
      } catch (err) { toast(err.message, 'err'); }
    }));
    app.querySelectorAll('[data-add-targets]').forEach((b) => b.addEventListener('click', () => {
      const root = openModal({
        title: '添加目标客户',
        body: `<select class="input" id="add-sel" multiple size="10" style="height:auto">${customers.items.map((c) => `<option value="${c.id}">${esc(c.name)} · ${esc(c.country)}</option>`).join('')}</select>`,
        footer: `<button class="btn" data-close>取消</button><button class="btn primary" id="ok">添加</button>`,
      });
      root.querySelector('#ok').addEventListener('click', async () => {
        const ids = [...root.querySelector('#add-sel').selectedOptions].map((o) => Number(o.value));
        try {
          const r = await api(`/activities/${b.dataset.addTargets}/targets`, { method: 'POST', body: { customer_ids: ids } });
          toast(`已添加 ${r.added} 个目标客户`);
          closeModal();
          location.reload();
        } catch (e) { toast(e.message, 'err'); }
      });
    }));
  }
}
