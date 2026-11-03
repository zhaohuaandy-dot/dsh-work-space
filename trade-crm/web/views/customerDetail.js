// 客户详情：基础信息、联系人、跟进时间轴、海关记录、商机、营销触达、移交记录
import { api, avatar, esc, fmtDate, fmtDateTime, fmtMoney, fmtUsd, relTime, levelTag, statusTag, stageTag, empty, openModal, closeModal, readForm, toast, daysUntil, progressBar } from '../util.js';
import { getOptions, openCustomerForm } from './customers.js';

export function openFollowupForm(customer, opportunityOptions, onSaved) {
  const root = openModal({
    title: `新增跟进 · ${customer.name}`,
    body: `<form id="fu" class="form-grid">
      <div class="field"><label>跟进方式</label><select class="input" name="type">${['电话', '邮件', 'WhatsApp', '展会', '拜访', '其他'].map((t) => `<option>${t}</option>`).join('')}</select></div>
      <div class="field"><label>关联商机</label><select class="input" name="opportunity_id"><option value="">不关联</option>${opportunityOptions.map((o) => `<option value="${o.id}">${esc(o.code)} · ${esc(o.title)}</option>`).join('')}</select></div>
      <div class="field full"><label>跟进内容 <span class="req">*</span></label><textarea class="input" name="content" rows="3" placeholder="记录客户反馈、报价情况、下一步计划…"></textarea></div>
      <div class="field full"><label>下一步计划</label><input class="input" name="next_plan" placeholder="例如：下周三前发送新版报价单" /></div>
    </form>`,
    footer: '<button class="btn" data-close>取消</button><button class="btn primary" id="ok">保存跟进</button>',
  });
  root.querySelector('#ok').addEventListener('click', async () => {
    const d = readForm(root.querySelector('#fu'));
    if (!d.content) return toast('请填写跟进内容', 'err');
    try {
      await api(`/customers/${customer.id}/followups`, { method: 'POST', body: d });
      toast('跟进记录已保存');
      closeModal();
      onSaved?.();
    } catch (e) { toast(e.message, 'err'); }
  });
}

function openContactForm(customer, onSaved) {
  const root = openModal({
    title: `添加联系人 · ${customer.name}`,
    body: `<form id="ct" class="form-grid">
      <div class="field"><label>姓名 <span class="req">*</span></label><input class="input" name="name" /></div>
      <div class="field"><label>职位</label><input class="input" name="title" /></div>
      <div class="field"><label>邮箱</label><input class="input" name="email" type="email" /></div>
      <div class="field"><label>电话</label><input class="input" name="phone" /></div>
      <div class="field"><label>WhatsApp</label><input class="input" name="whatsapp" /></div>
      <div class="field"><label>LinkedIn</label><input class="input" name="linkedin" /></div>
      <div class="field full"><label><input type="checkbox" name="is_kp" /> 设为关键决策人（KP）</label></div>
    </form>`,
    footer: '<button class="btn" data-close>取消</button><button class="btn primary" id="ok">保存</button>',
  });
  root.querySelector('#ok').addEventListener('click', async () => {
    const d = readForm(root.querySelector('#ct'));
    if (!d.name) return toast('请填写联系人姓名', 'err');
    try {
      await api(`/customers/${customer.id}/contacts`, { method: 'POST', body: d });
      toast('联系人已添加');
      closeModal();
      onSaved?.();
    } catch (e) { toast(e.message, 'err'); }
  });
}

export default async function customerDetail({ params }) {
  const id = params[0];
  if (!id) { location.hash = '#/customers'; return ''; }
  const [d, opts] = await Promise.all([api(`/customers/${id}`), getOptions()]);
  const { customer: c, contacts, customs, followups, opportunities, activities, handovers } = d;
  const dProtect = daysUntil(c.protection_until);

  const protectBanner = c.status === '公海'
    ? `<div class="note warn">该客户在公海中，尚未分配负责人。 <button class="btn sm primary" data-claim>领取客户</button></div>`
    : dProtect !== null && dProtect < 0
      ? `<div class="note warn">客户保护已于 ${fmtDate(c.protection_until)} 到期（${-dProtect} 天前）。 <button class="btn sm" data-protect>续保 30 天</button></div>`
      : dProtect !== null && dProtect <= 30
        ? `<div class="note warn">客户保护将在 ${dProtect} 天后到期（${fmtDate(c.protection_until)}）。 <button class="btn sm" data-protect>续保 30 天</button></div>`
        : '';

  const customsAmount = customs.reduce((a, s) => a + s.amount_usd, 0);
  const openOpps = opportunities.filter((o) => !['赢单', '输单'].includes(o.stage));

  const html = `
  <div class="page-head">
    <div><a href="#/customers" class="small">← 返回客户档案</a></div>
  </div>
  <section class="card">
    <div class="detail-head">
      <div class="logo-box" style="background:hsl(${(Number(c.id) * 47) % 360} 58% 52%)">${esc(c.name.slice(0, 1))}</div>
      <div style="flex:1;min-width:0">
        <div class="flex wrap">
          <h1>${esc(c.name)}</h1>
          ${levelTag(c.level)} ${statusTag(c.status)}
          <span class="tag outline">${esc(c.source)}</span>
          <span class="tag gray">${esc(c.code)}</span>
        </div>
        <div class="meta">
          <span>${esc(c.name_en)}</span>
          <span>${esc(c.country)} · ${esc(c.industry)}</span>
          <span>负责人 <b>${c.owner_name ? esc(c.owner_name) : '未分配'}</b></span>
          <span>客保至 <b>${fmtDate(c.protection_until)}</b></span>
          <span>最近跟进 <b>${relTime(c.last_follow_at)}</b></span>
          ${c.website ? `<span><a href="${esc(c.website)}" target="_blank" rel="noopener">${esc(String(c.website).replace(/^https?:\/\//, ''))}</a></span>` : ''}
        </div>
      </div>
      <div class="flex">
        <button class="btn" id="add-follow">+ 跟进</button>
        <button class="btn" id="edit-customer">编辑</button>
        ${c.status === '公海' ? '' : '<button class="btn" id="transfer">移交</button>'}
      </div>
    </div>
    ${protectBanner ? `<div style="padding:0 18px 16px">${protectBanner}</div>` : ''}
    <div class="split" style="grid-template-columns: repeat(4, minmax(0,1fr)); padding: 0 18px 16px; gap: 12px">
      <div class="kpi" style="box-shadow:none"><div class="k-label">海关交易额</div><div class="k-value" style="font-size:20px">${fmtMoney(customsAmount)}</div><div class="k-sub">${customs.length} 票记录</div></div>
      <div class="kpi" style="box-shadow:none"><div class="k-label">进行中商机</div><div class="k-value" style="font-size:20px">${fmtMoney(openOpps.reduce((a, o) => a + o.amount_usd, 0))}</div><div class="k-sub">${openOpps.length} 个商机</div></div>
      <div class="kpi" style="box-shadow:none"><div class="k-label">联系人</div><div class="k-value" style="font-size:20px">${contacts.length}</div><div class="k-sub">${contacts.filter((x) => x.is_kp).length} 位决策人（KP）</div></div>
      <div class="kpi" style="box-shadow:none"><div class="k-label">跟进次数</div><div class="k-value" style="font-size:20px">${followups.length}</div><div class="k-sub">最近 ${relTime(c.last_follow_at)}</div></div>
    </div>
  </section>

  <div class="detail-layout mt16">
    <div class="grid" style="gap:16px">
      <section class="card">
        <div class="card-head"><h2>跟进时间轴</h2><span class="sub">还原商务过程，防止报价风险</span><div class="spacer"></div><button class="btn sm primary" id="add-follow-2">+ 新增跟进</button></div>
        <div class="card-body">
          <div class="timeline">
            ${followups.length ? followups.map((f) => `
              <div class="timeline-item">
                <div class="t-head"><span class="tag blue">${esc(f.type)}</span><b>${esc(f.user_name ?? '—')}</b><span>${fmtDateTime(f.created_at)}</span>
                  ${f.opportunity_id ? `<span class="tag purple">商机 #${f.opportunity_id}</span>` : ''}</div>
                <div class="t-body">${esc(f.content)}</div>
                ${f.next_plan ? `<div class="mt8 note">下一步：${esc(f.next_plan)}</div>` : ''}
              </div>`).join('') : empty('暂无跟进记录')}
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>海关交易记录</h2><span class="sub">来自海关数据分析</span><div class="spacer"></div><a class="btn ghost sm" href="#/customs?customer=${c.id}">分析 →</a></div>
        <div class="card-body flush"><div class="table-wrap"><table class="table">
          <thead><tr><th>日期</th><th>商品</th><th>HS 编码</th><th>类型</th><th class="right">TEU</th><th class="right">金额</th><th>承运</th></tr></thead>
          <tbody>${customs.length ? customs.map((s) => `
            <tr><td class="muted">${fmtDate(s.shipment_date)}</td><td>${esc(s.product)}</td><td class="muted">${esc(s.hs_code)}</td>
            <td><span class="tag ${s.trade_type === '进口' ? 'blue' : 'green'}">${esc(s.trade_type)}</span></td>
            <td class="num">${s.teu}</td><td class="num">${fmtUsd(s.amount_usd)}</td><td class="muted">${esc(s.carrier)}</td></tr>`).join('') : `<tr><td colspan="7">${empty('暂无海关记录')}</td></tr>`}</tbody>
        </table></div></div>
      </section>

      <section class="card">
        <div class="card-head"><h2>商机</h2><div class="spacer"></div><a class="btn ghost sm" href="#/opportunities">商机看板 →</a></div>
        <div class="card-body flush"><div class="table-wrap"><table class="table">
          <thead><tr><th>编号</th><th>商机</th><th>阶段</th><th class="right">金额</th><th>预计成交</th><th>负责人</th></tr></thead>
          <tbody>${opportunities.length ? opportunities.map((o) => `
            <tr><td class="muted">${esc(o.code)}</td><td class="name">${esc(o.title)}</td><td>${stageTag(o.stage)}</td>
            <td class="num">${fmtUsd(o.amount_usd)}</td><td class="muted">${fmtDate(o.expected_close)}</td><td>${esc(o.owner_name ?? '—')}</td></tr>`).join('') : `<tr><td colspan="6">${empty('暂无商机')}</td></tr>`}</tbody>
        </table></div></div>
      </section>

      <section class="card">
        <div class="card-head"><h2>营销触达</h2><div class="spacer"></div><a class="btn ghost sm" href="#/activities">营销活动 →</a></div>
        <div class="card-body flush"><div class="table-wrap"><table class="table">
          <thead><tr><th>活动</th><th>状态</th><th>更新时间</th></tr></thead>
          <tbody>${activities.length ? activities.map((a) => `<tr><td>活动 #${a.activity_id}</td><td><span class="tag ${a.status === '已回复' ? 'green' : a.status === '已打开' ? 'blue' : 'gray'}">${esc(a.status)}</span></td><td class="muted">${fmtDateTime(a.updated_at)}</td></tr>`).join('') : `<tr><td colspan="3">${empty('暂未触达')}</td></tr>`}</tbody>
        </table></div></div>
      </section>

      ${handovers.length ? `<section class="card">
        <div class="card-head"><h2>移交记录</h2></div>
        <div class="card-body flush"><div class="table-wrap"><table class="table">
          <thead><tr><th>时间</th><th>从</th><th>至</th><th>原因</th><th>状态</th></tr></thead>
          <tbody>${handovers.map((h) => `<tr><td class="muted">${fmtDateTime(h.created_at)}</td><td>${esc(h.from_name ?? '—')}</td><td>${esc(h.to_name ?? '—')}</td><td>${esc(h.reason)}</td>
            <td><span class="tag ${h.status === '已接收' ? 'green' : 'orange'}">${esc(h.status)}</span></td></tr>`).join('')}</tbody>
        </table></div></div>
      </section>` : ''}
    </div>

    <div class="grid" style="gap:16px">
      <section class="card">
        <div class="card-head"><h2>基础信息</h2><div class="spacer"></div><button class="btn sm ghost" id="edit-customer-2">编辑</button></div>
        <div class="card-body"><dl class="kv">
          <dt>客户编码</dt><dd>${esc(c.code)}</dd>
          <dt>英文名</dt><dd>${esc(c.name_en) || '—'}</dd>
          <dt>所属区域</dt><dd>${esc(c.region) || '—'}</dd>
          <dt>行业</dt><dd>${esc(c.industry) || '—'}</dd>
          <dt>来源</dt><dd>${esc(c.source)}</dd>
          <dt>税号</dt><dd>${esc(c.tax_id) || '—'}</dd>
          <dt>地址</dt><dd>${esc(c.address) || '—'}</dd>
          <dt>创建时间</dt><dd>${fmtDate(c.created_at)}</dd>
          <dt>备注</dt><dd>${esc(c.remark) || '—'}</dd>
        </dl></div>
      </section>

      <section class="card">
        <div class="card-head"><h2>联系人</h2><div class="spacer"></div><button class="btn sm" id="add-contact">+ 添加</button></div>
        <div class="card-body" style="display:grid;gap:12px">
          ${contacts.length ? contacts.map((p) => `
            <div class="flex" style="align-items:flex-start">
              ${avatar(p.name, p.id * 3 + Number(c.id), 'lg')}
              <div style="flex:1;min-width:0">
                <div class="flex wrap"><b>${esc(p.name)}</b> ${p.is_kp ? '<span class="tag red">KP 决策人</span>' : ''}<span class="muted small">${esc(p.title)}</span></div>
                <div class="small muted">✉ ${esc(p.email) || '—'}</div>
                <div class="small muted">☎ ${esc(p.phone) || '—'} ${p.whatsapp ? ` · WhatsApp ${esc(p.whatsapp)}` : ''}</div>
                ${p.linkedin ? `<div class="small"><a href="https://${esc(String(p.linkedin).replace(/^https?:\/\//, ''))}" target="_blank" rel="noopener">${esc(p.linkedin)}</a></div>` : ''}
              </div>
            </div>`).join('') : empty('暂无联系人')}
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>客保与流转</h2></div>
        <div class="card-body">
          <div class="small muted">客户保护期</div>
          <div class="flex mt8"><b>${fmtDate(c.protection_until)}</b>
            ${dProtect !== null ? `<span class="tag ${dProtect < 0 ? 'red' : dProtect <= 30 ? 'orange' : 'green'}">${dProtect < 0 ? `已过期 ${-dProtect} 天` : `剩余 ${dProtect} 天`}</span>` : ''}
          </div>
          <div class="mt12">${dProtect !== null ? progressBar(Math.max(0, Math.min(100, (dProtect / 180) * 100)), dProtect < 30 ? 'orange' : 'green') : ''}</div>
          <div class="flex mt16">
            <button class="btn sm" id="protect">续保 30 天</button>
            ${c.status !== '公海' ? '<button class="btn sm danger" id="release">放入公海</button>' : '<button class="btn sm primary" id="claim">领取客户</button>'}
          </div>
        </div>
      </section>
    </div>
  </div>`;

  return { html, bind: () => bindDetail(c, opts, opportunities, d) };
}

function bindDetail(c, opts, opportunities, d) {
  const app = document.getElementById('app');
  const reload = () => location.reload();
  const openOpps = opportunities.filter((o) => !['赢单', '输单'].includes(o.stage));
  app.querySelector('#add-follow')?.addEventListener('click', () => openFollowupForm(c, openOpps, reload));
  app.querySelector('#add-follow-2')?.addEventListener('click', () => openFollowupForm(c, openOpps, reload));
  app.querySelector('#edit-customer')?.addEventListener('click', () => openCustomerForm(c, reload));
  app.querySelector('#edit-customer-2')?.addEventListener('click', () => openCustomerForm(c, reload));
  app.querySelector('#add-contact')?.addEventListener('click', () => openContactForm(c, reload));
  app.querySelectorAll('[data-protect], #protect').forEach((b) => b.addEventListener('click', async () => {
    try {
      await api(`/customers/${c.id}/protect`, { method: 'POST', body: { protection_days: 30 } });
      toast('客保已续期 30 天');
      reload();
    } catch (e) { toast(e.message, 'err'); }
  }));
  app.querySelectorAll('[data-claim], #claim').forEach((b) => b.addEventListener('click', async () => {
    try {
      await api(`/customers/${c.id}/claim`, { method: 'POST', body: { protection_days: 30 } });
      toast('领取成功');
      reload();
    } catch (e) { toast(e.message, 'err'); }
  }));
  app.querySelector('#release')?.addEventListener('click', async () => {
    if (!confirm('确定将该客户放入公海？')) return;
    try {
      await api(`/customers/${c.id}/release`, { method: 'POST', body: {} });
      toast('已放入公海');
      reload();
    } catch (e) { toast(e.message, 'err'); }
  });
  app.querySelector('#transfer')?.addEventListener('click', () => {
    const root = openModal({
      title: `客户移交 · ${c.name}`,
      body: `<div class="field"><label>接收人</label><select class="input" name="to_user_id">${opts.users.filter((u) => u.id !== c.owner_id).map((u) => `<option value="${u.id}">${esc(u.name)}（${esc(u.dept)}）</option>`).join('')}</select></div>
        <div class="field mt12"><label>移交原因</label><textarea class="input" name="reason" rows="2" placeholder="例如：业务员离职 / 区域调整"></textarea></div>`,
      footer: '<button class="btn" data-close>取消</button><button class="btn primary" id="ok">提交移交</button>',
    });
    root.querySelector('#ok').addEventListener('click', async () => {
      try {
        await api(`/customers/${c.id}/transfer`, { method: 'POST', body: readForm(root) });
        toast('移交申请已提交，等待接收人确认');
        closeModal();
        reload();
      } catch (e) { toast(e.message, 'err'); }
    });
  });
}
