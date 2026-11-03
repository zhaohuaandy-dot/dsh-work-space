// 种子数据：演示用的客户、联系人、海关数据、跟进记录、商机、营销活动、邮件模板。
import { getDb, closeDb, NOW } from './db.mjs';

const USERS = [
  { id: 1, name: '王芳', role: '销售经理', dept: '外贸一部', email: 'wangfang@example.com', hue: 210 },
  { id: 2, name: '李强', role: '业务员', dept: '外贸一部', email: 'liqiang@example.com', hue: 150 },
  { id: 3, name: '张敏', role: '业务员', dept: '外贸二部', email: 'zhangmin@example.com', hue: 25 },
  { id: 4, name: '陈静', role: '业务员', dept: '外贸二部', email: 'chenjing@example.com', hue: 280 },
  { id: 5, name: '赵磊', role: '管理员', dept: '管理部', email: 'zhaolei@example.com', hue: 350 },
];

const COUNTRIES = [
  ['德国', 'Europe', 'DE'], ['美国', 'North America', 'US'], ['意大利', 'Europe', 'IT'], ['西班牙', 'Europe', 'ES'],
  ['巴西', 'South America', 'BR'], ['阿联酋', 'Middle East', 'AE'], ['波兰', 'Europe', 'PL'], ['印度', 'Asia', 'IN'],
  ['英国', 'Europe', 'GB'], ['荷兰', 'Europe', 'NL'], ['加拿大', 'North America', 'CA'], ['土耳其', 'Middle East', 'TR'],
  ['墨西哥', 'North America', 'MX'], ['澳大利亚', 'Oceania', 'AU'], ['越南', 'Asia', 'VN'], ['法国', 'Europe', 'FR'],
];

const PRODUCTS = [
  ['8481804090', '不锈钢阀门', 3200], ['7326909000', '金属结构件', 1800], ['8504409999', '电源适配器', 2400],
  ['3917230000', 'PVC 管件', 1500], ['9405409000', 'LED 灯具', 2100], ['6110200090', '针织服装', 1200],
  ['4011100000', '汽车轮胎', 2600], ['7228600000', '合金钢棒材', 2900],
];

const INDUSTRIES = ['机械五金', '电气电子', '建材', '纺织服装', '汽车配件', '化工产品'];
const SOURCES = ['海关数据', '展会', '网站询盘', 'B2B平台', '社媒', '自主开发'];
const LEVELS = ['A', 'A', 'B', 'B', 'C', 'C', 'C', 'D'];
const STATUSES = ['跟进中', '跟进中', '跟进中', '跟进中', '已成交', '已成交', '公海', '跟进中', '跟进中', '已流失'];

let rngState = 20261102;
export function rand() {
  rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
  return rngState / 0x7fffffff;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (min, max) => Math.round(min + rand() * (max - min));
const pad = (n, width = 3) => String(n).padStart(width, '0');
// 以“今天”为基准生成日期，保证演示数据始终落在近期
const BASE = (() => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; })();
function day(offsetDays) {
  const d = new Date(BASE);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
const stamp = (offsetDays) => `${day(offsetDays)} ${pad(between(8, 19), 2)}:${pad(between(0, 59), 2)}:00`;

const COMPANY_PREFIX = ['Rhein', 'Nordic', 'Atlas', 'Prime', 'Delta', 'Sunrise', 'Global', 'Pacific', 'Vertex', 'Bluewave', 'Orbit', 'Grand', 'Alpha', 'Meridian', 'Crescent', 'Arc', 'Kestrel', 'Vega', 'Summit', 'Harbor', 'Lumen', 'Falke', 'Westwind', 'Everest'];
const COMPANY_SUFFIX = { 德国: 'GmbH', 美国: 'Inc.', 意大利: 'S.r.l.', 西班牙: 'S.L.', 巴西: 'Ltda.', 阿联酋: 'LLC', 波兰: 'Sp. z o.o.', 印度: 'Pvt. Ltd', 英国: 'Ltd', 荷兰: 'B.V.', 加拿大: 'Ltd.', 土耳其: 'A.Ş.', 墨西哥: 'S.A. de C.V.', 澳大利亚: 'Pty Ltd', 越南: 'Co., Ltd', 法国: 'SAS' };
const INDUSTRY_WORD = {
  机械五金: ['Metalworks', 'Hardware', 'Machinery', 'Fasteners'],
  电气电子: ['Electronics', 'Powertech', 'Elektro', 'Voltage'],
  建材: ['Building Materials', 'Construction Supply', 'Baustoff'],
  纺织服装: ['Textiles', 'Apparel', 'Garments'],
  汽车配件: ['Auto Parts', 'Autotech', 'Motor Supply'],
  化工产品: ['Chemicals', 'Polymer', 'ChemTrade'],
};
const CITY = { 德国: 'Hamburg', 美国: 'Chicago', 意大利: 'Milan', 西班牙: 'Madrid', 巴西: 'Sao Paulo', 阿联酋: 'Dubai', 波兰: 'Warsaw', 印度: 'Mumbai', 英国: 'London', 荷兰: 'Rotterdam', 加拿大: 'Toronto', 土耳其: 'Istanbul', 墨西哥: 'Mexico City', 澳大利亚: 'Sydney', 越南: 'Hanoi', 法国: 'Lyon' };
const CN_INDUSTRY = { 机械五金: '五金', 电气电子: '电子', 建材: '建材', 纺织服装: '纺织', 汽车配件: '汽配', 化工产品: '化工' };
const FIRST = ['Markus', 'Laura', 'Thomas', 'Anna', 'Carlos', 'Fatima', 'Piotr', 'Raj', 'James', 'Sanne', 'Olivia', 'Emre', 'Diego', 'Chloe', 'Minh', 'Pierre'];
const LAST = ['Weber', 'Schmidt', 'Rossi', 'Garcia', 'Silva', 'AlMansoori', 'Nowak', 'Patel', 'Brown', 'deVries', 'Wilson', 'Yilmaz', 'Hernandez', 'Martin', 'Nguyen', 'Dubois'];
const FIRST_CN = ['马克', '劳拉', '托马斯', '安娜', '卡洛斯', '法蒂玛', '彼得', '拉杰', '詹姆斯', '桑妮', '奥利维亚', '埃姆雷', '迭戈', '克洛伊', '明', '皮埃尔'];
const LAST_CN = ['韦伯', '施密特', '罗西', '加西亚', '席尔瓦', '曼苏里', '诺瓦克', '帕特尔', '布朗', '德弗里斯', '威尔逊', '伊尔马兹', '埃尔南德斯', '马丁', '阮', '杜布瓦'];
const TITLES = ['采购经理', '采购总监', '总经理', '供应链经理', '合伙人'];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function isSeeded(db) {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('seeded_at');
  return Boolean(row);
}

export function seed({ reset = false } = {}) {
  const db = getDb();
  if (reset) {
    db.exec('PRAGMA foreign_keys = OFF');
    for (const t of ['quotation_items', 'quotations', 'orders', 'handovers', 'templates', 'activity_targets', 'activities', 'followups', 'opportunities', 'customs', 'contacts', 'customers', 'users', 'meta']) {
      db.exec(`DELETE FROM ${t}`);
    }
    db.exec('PRAGMA foreign_keys = ON');
    rngState = 20261102;
  }
  if (isSeeded(db)) return { seeded: false, reason: 'already seeded' };

  const now = NOW();
  // 用户表是系统账号，可能已存在（例如清空业务数据后重新导入真实数据）：
  // 用 INSERT OR IGNORE 保证重复初始化不会因主键冲突而中断。
  const insUser = db.prepare('INSERT OR IGNORE INTO users (id, name, role, dept, email, avatar_hue) VALUES (?, ?, ?, ?, ?, ?)');
  for (const u of USERS) insUser.run(u.id, u.name, u.role, u.dept, u.email, u.hue);

  const insCustomer = db.prepare(`INSERT INTO customers
    (id, code, name, name_en, country, region, industry, website, level, source, status, owner_id, protection_until, tax_id, address, remark, created_at, last_follow_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insContact = db.prepare(`INSERT INTO contacts (customer_id, name, title, email, phone, whatsapp, linkedin, is_kp, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insCustoms = db.prepare(`INSERT INTO customs (customer_id, hs_code, product, importer, importer_country, exporter, exporter_country, trade_type, teu, weight_t, amount_usd, shipment_date, carrier, source_country, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const TOTAL = 46;
  for (let i = 1; i <= TOTAL; i++) {
    const [country, region, cc] = COUNTRIES[(i - 1) % COUNTRIES.length];
    const industry = INDUSTRIES[(i - 1) % INDUSTRIES.length];
    const prefix = COMPANY_PREFIX[(i * 7) % COMPANY_PREFIX.length];
    const word = INDUSTRY_WORD[industry][i % INDUSTRY_WORD[industry].length];
    const slug = `${prefix.toLowerCase()}-${word.toLowerCase().replace(/[^a-z]/g, '')}`;
    const nameEn = `${prefix} ${word} ${COMPANY_SUFFIX[country] ?? 'Ltd'}`;
    const nameZh = `${prefix} ${CN_INDUSTRY[industry]}公司`;
    const status = STATUSES[(i - 1) % STATUSES.length];
    const source = SOURCES[(i * 3) % SOURCES.length];
    const level = LEVELS[(i * 5) % LEVELS.length];
    const owner = status === '公海' ? null : USERS[i % 4].id;
    const created = stamp(-between(15, 400));
    const lastFollow = status === '公海' ? null : stamp(-between(0, 60));
    const protection = status === '公海' ? null : day(between(-300, 200));
    insCustomer.run(
      i, `C${pad(i, 4)}`, nameZh, nameEn, country, region, industry, `https://www.${slug}.${cc.toLowerCase()}`,
      level, source, status, owner, protection, `${cc}${between(10000000, 99999999)}`,
      `${prefix} Street ${between(1, 200)}, ${CITY[country]}, ${country}`,
      status === '已成交' ? '长期合作客户，年度框架订单' : '',
      created, lastFollow,
    );

    const contactCount = 1 + (i % 3);
    for (let c = 0; c < contactCount; c++) {
      const first = FIRST[(i * 3 + c) % FIRST.length];
      const last = LAST[(i + c * 5) % LAST.length];
      insContact.run(i, `${FIRST_CN[(i * 3 + c) % FIRST_CN.length]}${LAST_CN[(i + c * 5) % LAST_CN.length]}`, c === 0 ? '采购总监' : TITLES[(i + c) % TITLES.length],
        `${first.toLowerCase()}.${last.toLowerCase()}@${slug}.${cc.toLowerCase()}`,
        `+${between(1, 99)} ${between(100, 999)} ${between(1000, 9999)}`,
        c === 0 ? `+${between(1, 99)} ${between(600, 999)} ${between(100000, 999999)}` : '',
        c === 0 ? `linkedin.com/in/${first.toLowerCase()}-${last.toLowerCase()}` : '',
        c === 0 ? 1 : 0, created);
    }

    const shipCount = 1 + (i % 5);
    for (let s = 0; s < shipCount; s++) {
      const p = PRODUCTS[(i + s) % PRODUCTS.length];
      const teu = [0.5, 1, 2, 3, 4][(i + s) % 5];
      const isExport = status === '公海' ? 1 : 0;
      insCustoms.run(
        i, p[0], p[1],
        isExport ? 'SHENZHEN EXPORT TRADE CO' : nameEn, isExport ? '中国' : country,
        isExport ? nameEn : 'NINGBO HAITIAN INDUSTRY CO', isExport ? country : '中国',
        isExport ? '出口' : '进口',
        teu, Math.round(teu * between(9, 14) * 10) / 10,
        Math.round(p[2] * teu * (0.8 + rand() * 0.6)),
        day(-between(10, 540)), `COSCO ${between(1000, 9999)}`, pick(['中国', country, '越南', '土耳其']), created,
      );
    }
  }

  // 潜在买家（未建档的海关采购商），用于“贸易监测”提醒与一键建档
  const POTENTIAL = [
    ['Neckar Valve Systems GmbH', '德国', '8481804090', '不锈钢阀门'], ['Ohio Flow Controls Inc.', '美国', '8481804090', '不锈钢阀门'],
    ['Lombardia Industrie S.r.l.', '意大利', '7326909000', '金属结构件'], ['Andalucía Suministros S.L.', '西班牙', '8504409999', '电源适配器'],
    ['Brasil Tubos Ltda.', '巴西', '3917230000', 'PVC 管件'], ['Gulf Lighting Trading LLC', '阿联酋', '9405409000', 'LED 灯具'],
    ['Wielkopolska Stal Sp. z o.o.', '波兰', '7228600000', '合金钢棒材'], ['Deccan Pumps Pvt. Ltd', '印度', '8481804090', '不锈钢阀门'],
    ['Yorkshire Fittings Ltd', '英国', '3917230000', 'PVC 管件'], ['Rotterdam Flow B.V.', '荷兰', '8481804090', '不锈钢阀门'],
    ['Bosphorus Metal A.Ş.', '土耳其', '7228600000', '合金钢棒材'], ['Monterrey Llantas S.A. de C.V.', '墨西哥', '4011100000', '汽车轮胎'],
  ];
  POTENTIAL.forEach(([importer, country, hs, product], idx) => {
    const p = PRODUCTS.find((x) => x[0] === hs);
    const teu = [1, 2, 3, 4][idx % 4];
    insCustoms.run(null, hs, product, importer, country, 'NINGBO HAITIAN INDUSTRY CO', '中国', '进口', teu,
      Math.round(teu * 11.5 * 10) / 10, Math.round(p[2] * teu * (0.9 + idx * 0.03)),
      day(-between(3, 88)), `MSC ${between(1000, 9999)}`, '中国', stamp(-between(3, 88)));
  });

  // 商机
  const STAGES = [['初步接触', 15], ['需求确认', 30], ['报价中', 50], ['谈判中', 75], ['赢单', 100], ['输单', 0]];
  const SUMMARY_PRODUCT = ['不锈钢阀门', 'LED 灯具', '汽车轮胎', '电源适配器', 'PVC 管件', '合金钢棒材', '金属结构件', '针织服装'];
  const oppData = [
    [1, '谈判中', 128000, 10, '海关数据'], [2, '赢单', 245000, 20, '展会'], [3, '报价中', 76000, 7, '网站询盘'],
    [4, '需求确认', 52000, 15, 'B2B平台'], [5, '初步接触', 34000, 25, '海关数据'], [6, '谈判中', 310000, 12, '自主开发'],
    [7, '赢单', 189000, 18, '社媒'], [8, '输单', 98000, -5, '海关数据'], [9, '报价中', 66000, 6, '展会'],
    [10, '需求确认', 142000, 45, '网站询盘'], [11, '初步接触', 28000, 30, 'B2B平台'], [12, '谈判中', 205000, 9, '自主开发'],
    [13, '赢单', 88000, 22, '海关数据'], [14, '初步接触', 45000, 18, '展会'], [15, '需求确认', 120000, 50, '网站询盘'],
    [16, '报价中', 156000, 8, '社媒'], [17, '谈判中', 92000, 14, 'B2B平台'], [18, '需求确认', 61000, 40, '自主开发'],
    [19, '赢单', 275000, 26, '海关数据'], [20, '报价中', 73000, 11, '展会'], [21, '初步接触', 39000, 21, '网站询盘'],
    [22, '谈判中', 168000, 13, '社媒'], [23, '需求确认', 84000, 48, 'B2B平台'], [24, '报价中', 114000, 5, '海关数据'],
    [25, '赢单', 204000, 16, '自主开发'], [26, '初步接触', 27000, 28, '展会'], [27, '谈判中', 146000, 17, '网站询盘'],
    [28, '需求确认', 58000, 35, '社媒'], [29, '报价中', 97000, 4, 'B2B平台'], [30, '赢单', 132000, 19, '海关数据'],
  ];
  const insOpp = db.prepare(`INSERT INTO opportunities (id, code, title, customer_id, stage, amount_usd, win_rate, expected_close, owner_id, source, created_at, stage_changed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  oppData.forEach(([customerId, stage, amount, closeIn, source], idx) => {
    const winRate = STAGES.find((s) => s[0] === stage)[1];
    insOpp.run(
      idx + 1, `OPP${day(0).slice(0, 4)}${pad(idx + 1, 4)}`,
      `${SUMMARY_PRODUCT[idx % SUMMARY_PRODUCT.length]} · ${pick(['年度采购计划', '试单转正式订单', '新品类合作', '补货订单', 'OEM 代工'])}`,
      customerId, stage, amount, winRate, day(closeIn), USERS[(customerId % 4)].id, source,
      stamp(-between(20, 120)), stamp(-between(0, 20)),
    );
  });

  // 跟进记录
  const insFollow = db.prepare(`INSERT INTO followups (customer_id, opportunity_id, type, content, user_id, next_plan, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const FOLLOW_TEXTS = [
    '电话沟通，客户确认了下季度的采购预算，计划增加两个新品类。',
    '发送新版报价单，客户反馈价格需再优惠 3%，等待内部审批。',
    '客户来访工厂参观产线，对质量控制流程表示满意。',
    '回复客户询盘邮件，已附上产品目录与认证证书。',
    'WhatsApp 跟进交期问题，客户确认可以接受 45 天。',
    '展会现场洽谈，交换名片并安排了视频会议。',
    '客户要求提供同类产品的第三方检测报告。',
    '邮件发送样品跟踪号，客户表示已收到正在测试。',
  ];
  for (let i = 1; i <= TOTAL; i += 2) {
    const n = 2 + (i % 3);
    for (let k = 0; k < n; k++) {
      insFollow.run(i, k === 0 && i <= 30 ? i : null, ['电话', '邮件', 'WhatsApp', '展会', '拜访'][(i + k) % 5],
        FOLLOW_TEXTS[(i + k) % FOLLOW_TEXTS.length], USERS[(i + k) % 4].id,
        k === n - 1 ? '下周一前确认最终报价' : '', stamp(-between(0, 90)));
    }
  }

  // 营销活动
  const insAct = db.prepare(`INSERT INTO activities (id, name, kind, status, target_count, sent_count, open_count, reply_count, start_date, end_date, owner_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const YEAR = day(0).slice(0, 4);
  const acts = [
    [1, 'Q4 不锈钢阀门新品推广', '邮件营销', '进行中', day(-20), day(10)],
    [2, `${YEAR} 秋季广交会展后跟进`, '展会', '已完成', day(-45), day(-10)],
    [3, 'German Market EDM 第一轮', 'EDM群发', '已完成', day(-60), day(-30)],
    [4, 'LinkedIn 采购经理精准触达', '社媒营销', '进行中', day(-12), day(20)],
    [5, '老客户复购唤醒计划', '邮件营销', '已暂停', day(-70), day(-20)],
  ];
  const insTarget = db.prepare(`INSERT INTO activity_targets (activity_id, customer_id, status, updated_at) VALUES (?, ?, ?, ?)`);
  acts.forEach(([id, name, kind, status, start, end]) => {
    insAct.run(id, name, kind, status, 0, 0, 0, 0, start, end, USERS[(id % 4) + 1].id, start);
    // 目标客户：按“待发送 → 已发送 → 已打开 → 已回复”的漏斗比例铺状态，
    // 已完成的活动全部发出，进行中 / 已暂停的活动保留未发送目标。
    const count = id === 5 ? 14 : 18;
    const progress = status === '已完成' ? 0.85 : status === '进行中' ? 0.5 : 0.35;
    for (let c = 1; c <= count; c++) {
      const cid = ((id - 1) * 9 + c - 1) % TOTAL + 1;
      const roll = (rand() + c / count) / 2;
      let st;
      if (status === '已完成') {
        st = roll < progress * 0.35 ? '已回复' : roll < progress * 0.65 ? '已打开' : '已发送';
      } else {
        st = roll >= progress ? '待发送' : roll < progress * 0.35 ? '已回复' : roll < progress * 0.65 ? '已打开' : '已发送';
      }
      insTarget.run(id, cid, st, stamp(-between(1, 40)));
    }
    // 计数由真实目标客户状态汇总得出，保证详情页与统计口径一致
    const agg = db.prepare(`SELECT COUNT(*) total,
        SUM(status <> '待发送') sent, SUM(status IN ('已打开','已回复')) opened, SUM(status = '已回复') replied
      FROM activity_targets WHERE activity_id = ?`).get(id);
    db.prepare('UPDATE activities SET target_count = ?, sent_count = ?, open_count = ?, reply_count = ? WHERE id = ?')
      .run(agg.total, agg.sent ?? 0, agg.opened ?? 0, agg.replied ?? 0, id);
  });

  // 邮件模板
  const insTpl = db.prepare(`INSERT INTO templates (name, category, subject, body, created_at) VALUES (?, ?, ?, ?, ?)`);
  const SIGN = '<p>Best regards,<br>{{sender}}<br>{{company}} · Export Sales Dept.</p>';
  const tpls = [
    ['新品推荐开发信', '开发信', 'New {{product}} series from {{company}} — lower MOQ, 3-year warranty',
      `<p>Dear {{contact}},</p><p>We noticed from trade records that you import <b>{{product}}</b> (HS {{hs_code}}). Our new series for {{product}} ships from {{origin}} with MOQ {{MOQ}} and a 3-year warranty.</p><p>May I send you the full specification sheet and price list?</p>${SIGN}`],
    ['展会邀请函', '开发信', 'Invitation: Booth {{booth}} at Canton Fair Phase 1',
      `<p>Dear {{contact}},</p><p>We will exhibit at Canton Fair, booth {{booth}}, showcasing our {{product}} line. Let us know a suitable time and we will reserve a meeting slot.</p>${SIGN}`],
    ['询盘回复模板', '询盘回复', 'Re: Your inquiry about {{product}} — quotation &amp; lead time',
      `<p>Dear {{contact}},</p><p>Thanks for your inquiry about {{product}}. Please find our quotation attached.<br>Lead time: 30 days · Payment: T/T 30% deposit.</p>${SIGN}`],
    ['报价跟进模板', '报价跟进', 'Any feedback on quotation {{quote_no}}?',
      `<p>Dear {{contact}},</p><p>Just following up on quotation {{quote_no}} sent last week. Happy to adjust the specification or the volume to fit your plan.</p>${SIGN}`],
    ['节日问候模板', '节日问候', "Season's greetings from {{company}}",
      `<p>Dear {{contact}},</p><p>Wishing you and your team a joyful holiday season and a prosperous new year. We look forward to serving you in 2027.</p>${SIGN}`],
  ];
  for (const t of tpls) insTpl.run(t[0], t[1], esc(t[2]), t[3], now);

  // 报价单与订单（交易管理）
  const insQuote = db.prepare(`INSERT INTO quotations (id, code, customer_id, opportunity_id, title, currency, incoterms, port, valid_until, status, owner_id, remark, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insQuoteItem = db.prepare('INSERT INTO quotation_items (quotation_id, hs_code, product, spec, qty, unit_price) VALUES (?, ?, ?, ?, ?, ?)');
  const PORTS = ['宁波港', '上海港', '深圳港', '青岛港'];
  const QUOTE_STATUS = ['草稿', '待审批', '已发出', '已接受', '已拒绝', '已过期'];
  const quoteSeed = [];
  for (let q = 1; q <= 14; q++) {
    const customerId = q * 2;
    const p = PRODUCTS[q % PRODUCTS.length];
    const status = QUOTE_STATUS[q % QUOTE_STATUS.length];
    const created = stamp(-between(5, 120));
    insQuote.run(q, `QT${day(0).slice(0, 4)}${pad(q, 4)}`, customerId, q <= 10 ? q : null,
      `${p[1]} 报价 · ${pick(['试单', '年度框架', '补货', '样品确认'])}`, 'USD', ['FOB', 'CIF', 'EXW', 'CFR'][q % 4],
      PORTS[q % PORTS.length], day(between(5, 60)), status, USERS[(q % 4) + 1].id,
      '', created, created);
    const itemCount = 1 + (q % 3);
    for (let it = 0; it < itemCount; it++) {
      const pp = PRODUCTS[(q + it) % PRODUCTS.length];
      const unitPrice = Math.round((pp[2] / 100) * (0.9 + rand() * 0.4) * 100) / 100;
      insQuoteItem.run(q, pp[0], pp[1], ['DN50 PN16', 'DN80 PN16', '200W', '标准款', '定制'][(q + it) % 5], between(20, 600), unitPrice);
    }
    quoteSeed.push({ id: q, customerId, status });
  }

  const insOrder = db.prepare(`INSERT INTO orders (id, code, customer_id, quotation_id, title, amount_usd, currency, incoterms, status, payment_status, deposit_paid, etd, eta, owner_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const ORDER_STATUS = ['待生产', '生产中', '待出运', '已出运', '已签收', '已取消'];
  const PAY_STATUS = ['未收款', '部分收款', '已收齐'];
  for (let o = 1; o <= 10; o++) {
    const quote = quoteSeed[o - 1];
    const p = PRODUCTS[o % PRODUCTS.length];
    const amount = Math.round(p[2] * between(8, 40));
    const status = ORDER_STATUS[o % ORDER_STATUS.length];
    const pay = status === '已签收' ? '已收齐' : status === '已取消' ? '未收款' : PAY_STATUS[o % 3];
    const deposit = pay === '已收齐' ? amount : pay === '部分收款' ? Math.round(amount * 0.3) : 0;
    const created = stamp(-between(10, 150));
    insOrder.run(o, `SO${day(0).slice(0, 4)}${pad(o, 4)}`, quote.customerId, quote.status === '已接受' ? quote.id : (o % 3 === 0 ? quote.id : null),
      `${p[1]} 出口订单`, amount, 'USD', ['FOB', 'CIF', 'CFR'][o % 3], status, pay, deposit,
      day(between(-20, 40)), day(between(20, 80)), USERS[(o % 4) + 1].id, created, created);  }

  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('seeded_at', now);
  return {
    seeded: true,
    counts: {
      users: USERS.length,
      customers: db.prepare('SELECT COUNT(*) c FROM customers').get().c,
      customs: db.prepare('SELECT COUNT(*) c FROM customs').get().c,
      opportunities: db.prepare('SELECT COUNT(*) c FROM opportunities').get().c,
    },
  };
}

if (process.argv[1]?.endsWith('seed.mjs')) {
  const r = seed({ reset: process.argv.includes('--reset') });
  console.log(JSON.stringify(r));
  closeDb();
}
