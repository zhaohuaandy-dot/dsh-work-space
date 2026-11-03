// CSV 导入相关测试：解析、字段映射、去重、干跑回滚、海关匹配客户、清空。
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TMP = mkdtempSync(join(tmpdir(), 'trade-crm-import-'));
const PORT = 3914;
const BASE = `http://127.0.0.1:${PORT}`;
const env = { ...process.env, PORT: String(PORT), DSH_TCRM_DATA: TMP, DSH_TCRM_DB: join(TMP, 'test.db'), HOST: '127.0.0.1' };

let passed = 0;
const failures = [];
const check = (name, cond, extra) => {
  if (cond) { passed++; return; }
  failures.push(`${name}${extra ? ` — ${extra}` : ''}`);
};

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

const child = spawn(process.execPath, [join(ROOT, 'server', 'index.mjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
child.stdout.on('data', (d) => { log += d; });
child.stderr.on('data', (d) => { log += d; });

async function waitUp() {
  for (let i = 0; i < 60; i++) {
    try { if ((await call('/api/ping')).status === 200) return true; } catch { /* wait */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

const CUSTOMERS_CSV = `客户名称,英文名称,国家,行业,客户分级,线索来源,负责人,联系人,邮箱,电话,备注
Alpha 贸易有限公司,Alpha Trading GmbH,德国,机械五金,A,海关数据,王芳,Anna Weber,anna@alpha.de,+49 40 111,
「引号」公司,Quote & Co Ltd,英国,建材,B,展会,李强,Tom Baker,tom@quote.co.uk,+44 20 2222,"含逗号, 的备注"
重复公司,Alpha Trading GmbH,德国,机械五金,C,自主开发,张敏,,,,重复英文名应跳过
,无名称公司,法国,化工,D,自主开发,赵磊,,,,应报错
Gamma S.r.l.,Gamma S.r.l.,意大利,汽车配件,C,社媒,陈静,,,,`;

const CUSTOMS_CSV = `采购商,采购商国家,HS编码,商品,日期,TEU,金额,承运
Alpha Trading GmbH,德国,8481804090,不锈钢阀门,2026/9/1,2,45200,COSCO 1234
Alpha Trading GmbH,德国,8481804090,不锈钢阀门,2026-09-01,2,45200,MSC 9999
Unknown Buyer Inc.,美国,8481804090,不锈钢阀门,2026.10.5,1,12000,MSC 8888`;

try {
  if (!await waitUp()) throw new Error(`服务未启动：\n${log}`);

  // 先清空演示数据，模拟“从零开始导入真实数据”
  const cleared = await call('/api/reset', { method: 'POST', body: { confirm: 'DELETE' } });
  check('清空业务数据', cleared.status === 200 && cleared.data.cleared === true, JSON.stringify(cleared.data));
  check('清空后客户为 0', (await call('/api/customers')).data.total === 0);
  const badReset = await call('/api/reset', { method: 'POST', body: {} });
  check('清空需要确认串', badReset.status === 400);

  // 模板
  const tpl = await call('/api/import/template/customers');
  check('提供客户导入模板', tpl.data.csv.includes('客户名称') && tpl.data.csv.includes('英文名称'));

  // 干跑：不应写入
  const dry = await call('/api/import/customers', { method: 'POST', body: { csv: CUSTOMERS_CSV, dry_run: true } });
  check('干跑返回统计', dry.status === 200 && dry.data.total === 5, JSON.stringify(dry.data));
  check('干跑不写库', (await call('/api/customers')).data.total === 0);

  // 正式导入
  const imp = await call('/api/import/customers', { method: 'POST', body: { csv: CUSTOMERS_CSV } });
  check('客户导入成功', imp.status === 200 && imp.data.created === 3, JSON.stringify(imp.data));
  check('重复英文名被跳过', imp.data.skipped === 1, `skipped=${imp.data.skipped}`);
  check('空名称被记为错误', imp.data.errors.length === 1 && imp.data.errors[0].line === 5, JSON.stringify(imp.data.errors));
  const list = await call('/api/customers?size=50');
  check('库中客户数正确', list.data.total === 3, `total=${list.data.total}`);
  const alpha = list.data.items.find((c) => c.name_en === 'Alpha Trading GmbH');
  check('字段映射正确（分级/来源/负责人）', alpha && alpha.level === 'A' && alpha.source === '海关数据' && alpha.owner_name === '王芳', JSON.stringify(alpha));
  check('自动生成客户编码', /^C\d{4}$/.test(alpha.code), alpha.code);
  const quoted = list.data.items.find((c) => c.name === '「引号」公司');
  check('引号与字段内逗号解析正确', quoted && quoted.remark.includes('含逗号, 的备注'), JSON.stringify(quoted?.remark));

  const alphaDetail = await call(`/api/customers/${alpha.id}`);
  check('联系人随客户导入', alphaDetail.data.contacts.length === 1 && alphaDetail.data.contacts[0].email === 'anna@alpha.de');

  // 海关导入 + 自动匹配客户
  const cimp = await call('/api/import/customs', { method: 'POST', body: { csv: CUSTOMS_CSV } });
  check('海关导入成功', cimp.status === 200 && cimp.data.created === 2, JSON.stringify(cimp.data));
  check('重复提单被跳过', cimp.data.skipped === 1, `skipped=${cimp.data.skipped}`);
  check('已建档采购商自动关联', cimp.data.matched === 1, `matched=${cimp.data.matched}`);
  const analysis = await call('/api/customs/analysis');
  check('导入后出现在海关分析', analysis.data.summary.shipments === 2, JSON.stringify(analysis.data.summary));
  check('未建档买家进入潜在买家', analysis.data.potentials.some((p) => p.name === 'Unknown Buyer Inc.'));
  check('日期格式归一化（2026/9/1 → 2026-09-01）', (await call('/api/customs')).data.items.some((r) => r.shipment_date === '2026-09-01'));

  // 导出
  const exp = await call('/api/customers/export');
  check('导出 CSV 含表头与数据', exp.data.csv.includes('客户名称') && exp.data.count === 3);
  const roundtrip = await call('/api/import/customers', { method: 'POST', body: { csv: exp.data.csv, dry_run: true } });
  check('导出内容可再次导入且全部识别为重复', roundtrip.data.skipped === 3 && roundtrip.data.created === 0, JSON.stringify(roundtrip.data));

  // 错误处理
  const badCsv = await call('/api/import/customers', { method: 'POST', body: { csv: 'foo,bar\n1,2' } });
  check('缺少必需列时报错并回显表头', badCsv.status === 400 && badCsv.data.error.includes('客户名称'), JSON.stringify(badCsv.data));
  const emptyCsv = await call('/api/import/customers', { method: 'POST', body: { csv: '' } });
  check('空内容被拒绝', emptyCsv.status === 400);
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
