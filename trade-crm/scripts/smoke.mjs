// API 冒烟测试：使用临时数据库启动真实服务，覆盖客户、海关建档、客保/公海、商机、营销活动、模板等主要流程。
// 用法：node scripts/smoke.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TMP = mkdtempSync(join(tmpdir(), 'trade-crm-smoke-'));
const PORT = 3911;
const BASE = `http://127.0.0.1:${PORT}`;
const env = { ...process.env, PORT: String(PORT), DSH_TCRM_DATA: TMP, DSH_TCRM_DB: join(TMP, 'smoke.db'), HOST: '127.0.0.1' };

let passed = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { passed++; return; }
  failures.push(`${name}${extra ? ` — ${extra}` : ''}`);
}

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

const child = spawn(process.execPath, [join(ROOT, 'server', 'index.mjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
child.stdout.on('data', (d) => { log += d; });
child.stderr.on('data', (d) => { log += d; });

async function waitUp() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await call('/api/ping');
      if (r.status === 200) return true;
    } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

try {
  if (!await waitUp()) throw new Error(`服务未能启动：\n${log}`);

  // 静态页面与种子数据
  const index = await fetch(BASE + '/');
  check('首页可访问', index.status === 200 && (await index.text()).includes('外贸客户管理系统'));
  const stats = await call('/api/stats');
  check('统计接口返回客户数', stats.data.customers?.total > 0, JSON.stringify(stats.data).slice(0, 120));

  const options = await call('/api/options');
  check('下拉选项包含国家与用户', options.data.countries?.length > 0 && options.data.users?.length === 5);

  // 客户 CRUD
  const created = await call('/api/customers', { method: 'POST', body: { name: '冒烟测试公司', name_en: 'Smoke Test GmbH', country: '德国', industry: '机械五金', source: '展会', level: 'A', contacts: [{ name: '测试联系人', email: 't@example.com' }] } });
  check('新建客户返回 201 与编码', created.status === 201 && /^C\d{4}$/.test(created.data.code ?? ''), JSON.stringify(created.data));
  const newId = created.data.id;

  const bad = await call('/api/customers', { method: 'POST', body: { country: '德国' } });
  check('缺少必填字段时返回 400', bad.status === 400, `${bad.status} ${JSON.stringify(bad.data)}`);

  const detail = await call(`/api/customers/${newId}`);
  check('客户详情含联系人', detail.data.contacts?.length === 1 && detail.data.contacts[0].email === 't@example.com');

  const updated = await call(`/api/customers/${newId}`, { method: 'PUT', body: { level: 'B', remark: '冒烟测试更新' } });
  check('更新客户等级', updated.data.level === 'B' && updated.data.remark === '冒烟测试更新');

  const contact = await call(`/api/customers/${newId}/contacts`, { method: 'POST', body: { name: '第二次联系人', is_kp: true } });
  check('新增联系人', contact.status === 201);
  const detail2 = await call(`/api/customers/${newId}`);
  check('KP 联系人排序在前', detail2.data.contacts[0].is_kp === 1);

  // 跟进
  const follow = await call(`/api/customers/${newId}/followups`, { method: 'POST', body: { type: '邮件', content: '发送报价单', next_plan: '三天后回访' } });
  check('新增跟进记录', follow.status === 201);
  const detail3 = await call(`/api/customers/${newId}`);
  check('跟进后客户最近跟进时间更新', Boolean(detail3.data.customer.last_follow_at));

  // 客保与公海
  const protect = await call(`/api/customers/${newId}/protect`, { method: 'POST', body: { protection_days: 45 } });
  check('续保写入到期日', /^\d{4}-\d{2}-\d{2}$/.test(protect.data.protection_until ?? ''));
  const release = await call(`/api/customers/${newId}/release`, { method: 'POST', body: {} });
  check('放入公海清空负责人', release.data.status === '公海' && release.data.owner_id === null);
  const claim = await call(`/api/customers/${newId}/claim`, { method: 'POST', body: { user_id: 2, protection_days: 30 } });
  check('领取公海客户设置负责人与客保', claim.data.status === '跟进中' && claim.data.owner_id === 2 && Boolean(claim.data.protection_until));
  const claimAgain = await call(`/api/customers/${newId}/claim`, { method: 'POST', body: {} });
  check('非公海客户不可重复领取', claimAgain.status === 400);

  // 移交
  const transfer = await call(`/api/customers/${newId}/transfer`, { method: 'POST', body: { to_user_id: 3, reason: '区域调整' } });
  check('创建移交申请', transfer.status === 201 && transfer.data.status === '待接收');
  const accept = await call(`/api/handovers/${transfer.data.id}/accept`, { method: 'POST', body: {} });
  check('接收移交', accept.data.status === '已接收');
  const afterAccept = await call(`/api/customers/${newId}`);
  check('移交后客户归属变更', afterAccept.data.customer.owner_id === 3);

  // 海关数据与一键建档
  const analysis = await call('/api/customs/analysis');
  check('海关分析返回汇总与排名', analysis.data.summary?.shipments > 0 && analysis.data.importers.length > 0);
  check('海关分析返回潜在买家', analysis.data.potentials.length > 0);
  const potential = analysis.data.potentials[0];
  const convert = await call('/api/customs/convert', { method: 'POST', body: { importer: potential.name, country: potential.country, level: 'B' } });
  check('潜在买家一键建档', convert.status === 201 && convert.data.customer.source === '海关数据', JSON.stringify(convert.data).slice(0, 140));
  const dupConvert = await call('/api/customs/convert', { method: 'POST', body: { importer: potential.name, country: potential.country } });
  check('重复建档返回 409', dupConvert.status === 409, `${dupConvert.status}`);

  // 商机
  const opp = await call('/api/opportunities', { method: 'POST', body: { customer_id: newId, title: '冒烟测试商机', amount_usd: 123456, stage: '报价中' } });
  check('创建商机返回编号', opp.status === 201 && /^OPP\d{8}$/.test(opp.data.code ?? ''), JSON.stringify(opp.data));
  const oppUpd = await call(`/api/opportunities/${opp.data.id}`, { method: 'PUT', body: { stage: '赢单' } });
  check('商机推进到赢单并更新概率', oppUpd.data.stage === '赢单' && oppUpd.data.win_rate === 100);
  const list = await call('/api/opportunities');
  check('商机漏斗含 6 个阶段', list.data.pipeline.length === 6);

  // 营销活动
  const customers = await call('/api/customers?size=5');
  const ids = customers.data.items.map((c) => c.id).slice(0, 3);
  const act = await call('/api/activities', { method: 'POST', body: { name: '冒烟测试活动', kind: '邮件营销', customer_ids: ids } });
  check('创建营销活动并写入目标客户', act.status === 201);
  const actDetail = await call(`/api/activities/${act.data.id}`);
  check('活动目标客户数量正确', actDetail.data.targets.length === 3, `targets=${actDetail.data.targets.length}`);
  const advanced = await call(`/api/activities/${act.data.id}/advance`, { method: 'POST', body: {} });
  check('推进发送后已发送计数增加', advanced.data.activity.sent_count === 3, JSON.stringify(advanced.data.activity));
  const added = await call(`/api/activities/${act.data.id}/targets`, { method: 'POST', body: { customer_ids: [ids[0]] } });
  check('重复添加目标客户被忽略', added.data.added === 0);

  // 模板
  const tpls = await call('/api/templates');
  check('内置模板存在', tpls.data.items.length >= 5);
  const rendered = await call(`/api/templates/${tpls.data.items[0].id}/render`, { method: 'POST', body: { vars: { contact: 'Anna', product: '阀门' } } });
  check('模板变量渲染替换占位符', !rendered.data.subject.includes('{{contact}}') && rendered.data.body.includes('Anna'));

  // 报价单与订单
  const quote = await call('/api/quotations', { method: 'POST', body: { customer_id: newId, title: '冒烟测试报价', incoterms: 'CIF', port: '宁波港', items: [{ product: '不锈钢阀门', hs_code: '8481804090', spec: 'DN50', qty: 100, unit_price: 12.5 }, { product: 'PVC 管件', qty: 200, unit_price: 3.2 }] } });
  check('创建报价单返回编号与总额', quote.status === 201 && /^QT\d{8}$/.test(quote.data.code ?? '') && quote.data.total === 1890, JSON.stringify(quote.data));
  const quoteDetail = await call(`/api/quotations/${quote.data.id}`);
  check('报价单明细与合计正确', quoteDetail.data.items.length === 2 && quoteDetail.data.quotation.total === 1890);
  const quoteSent = await call(`/api/quotations/${quote.data.id}/status`, { method: 'POST', body: { status: '已发出' } });
  check('报价单状态流转', quoteSent.data.status === '已发出');
  const badStatus = await call(`/api/quotations/${quote.data.id}/status`, { method: 'POST', body: { status: '瞎写' } });
  check('非法报价状态被拒绝', badStatus.status === 400);
  const converted = await call(`/api/quotations/${quote.data.id}/convert`, { method: 'POST', body: {} });
  check('报价单转订单', converted.status === 201 && converted.data.amount_usd === 1890, JSON.stringify(converted.data));
  const convertAgain = await call(`/api/quotations/${quote.data.id}/convert`, { method: 'POST', body: {} });
  check('重复转订单返回 409', convertAgain.status === 409);
  const orderUpd = await call(`/api/orders/${converted.data.id}`, { method: 'PUT', body: { status: '已出运', payment_status: '部分收款' } });
  check('订单状态与收款更新', orderUpd.data.status === '已出运' && orderUpd.data.payment_status === '部分收款' && orderUpd.data.deposit_paid === 567);
  const orderBad = await call(`/api/orders/${converted.data.id}`, { method: 'PUT', body: { status: '不存在' } });
  check('非法订单状态被拒绝', orderBad.status === 400);
  const tradeSummary = await call('/api/trade/summary');
  check('交易汇总返回报价与订单统计', tradeSummary.data.quotations.count >= 1 && tradeSummary.data.orders.count >= 1);

  // 校验与错误处理
  const notFound = await call('/api/customers/999999');
  check('不存在的客户返回 404', notFound.status === 404);
  const unknown = await call('/api/nope');
  check('未知接口返回 404', unknown.status === 404);
  const badJson = await fetch(BASE + '/api/customers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
  check('非法 JSON 返回 400', badJson.status === 400);
  const traversal = await fetch(BASE + '/../server/api.mjs');
  check('静态目录不可穿越', traversal.status === 403 || traversal.status === 404, `${traversal.status}`);
} catch (e) {
  failures.push(`异常中断：${e.message}`);
} finally {
  const exited = new Promise((r) => child.once('exit', r));
  child.kill();
  await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
  await new Promise((r) => setTimeout(r, 300));
  for (let i = 0; i < 5; i++) {
    try { rmSync(TMP, { recursive: true, force: true }); break; } catch { await new Promise((r) => setTimeout(r, 400)); }
  }
  console.log(`\n通过 ${passed} 项检查，失败 ${failures.length} 项`);
  for (const f of failures) console.log(` ✗ ${f}`);
  if (failures.length) process.exitCode = 1;
}
