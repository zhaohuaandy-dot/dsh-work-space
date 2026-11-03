// CSV 导入 / 导出：把客户、联系人、海关记录从 Excel 导出的 CSV 装进系统。
// 约定：首行为表头；支持 UTF-8（含 BOM）与 GBK 编码；列名见下方字段映射。
import { getDb, NOW } from './db.mjs';

// ---------- CSV 解析（RFC 4180：支持引号包裹、字段内逗号/换行、"" 转义） ----------
export function parseCsv(text) {
  const src = String(text).replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ',') { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

// 表头别名：同一个字段允许多种中文/英文列名，方便直接用别人给的表格
const ALIASES = {
  customers: {
    name: ['客户名称', '客户', '公司名称', '中文名称', 'name'],
    name_en: ['英文名称', '英文名', 'name_en', 'company'],
    country: ['国家', '国家地区', 'country'],
    region: ['区域', 'region'],
    industry: ['行业', 'industry'],
    website: ['网站', '网址', 'website'],
    level: ['客户分级', '分级', '等级', 'level'],
    source: ['线索来源', '来源', 'source'],
    status: ['状态', 'status'],
    owner_name: ['负责人', '业务员', 'owner'],
    protection_until: ['客保到期', '客保到期日', 'protection_until'],
    tax_id: ['税号', '统一社会信用代码', 'tax_id'],
    address: ['地址', 'address'],
    remark: ['备注', 'remark', 'note'],
    contact_name: ['联系人', '联系人姓名', 'contact_name'],
    contact_email: ['邮箱', '联系人邮箱', 'email'],
    contact_phone: ['电话', '联系电话', 'phone'],
  },
  customs: {
    importer: ['采购商', '进口商', '买家', 'importer'],
    importer_country: ['采购商国家', '进口国', '国家', 'importer_country'],
    hs_code: ['HS编码', 'HS 编码', 'hs_code', '海关编码'],
    product: ['商品', '商品名称', '产品', 'product'],
    shipment_date: ['日期', '提单日期', '到港日期', 'shipment_date'],
    teu: ['TEU', '柜量', 'teu'],
    amount_usd: ['金额', '金额USD', 'amount', 'amount_usd'],
    weight_t: ['重量', '重量吨', 'weight'],
    carrier: ['承运', '船公司', 'carrier'],
    exporter: ['出口商', 'exporter'],
  },
};

function mapHeaders(headers, kind) {
  const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, '');
  const table = ALIASES[kind];
  const idx = {};
  headers.forEach((h, i) => {
    const key = norm(h);
    for (const [field, aliases] of Object.entries(table)) {
      if (idx[field] !== undefined) continue;
      if (aliases.some((a) => norm(a) === key)) idx[field] = i;
    }
  });
  return idx;
}

const pick = (row, idx, field) => {
  if (idx[field] === undefined) return '';
  return String(row[idx[field]] ?? '').trim();
};

const toNum = (v) => {
  if (v === '' || v === null || v === undefined) return 0;
  const n = Number(String(v).replace(/[,\s$]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// 日期统一为 YYYY-MM-DD：兼容 2026/3/1、2026.03.01、20260301
function toDate(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{4})[-/.年]?(\d{1,2})[-/.月]?(\d{1,2})/);
  if (!m) return '';
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

const LEVELS = new Set(['A', 'B', 'C', 'D']);
const STATUSES = new Set(['跟进中', '已成交', '公海', '已流失']);

function nextCustomerCode(db) {
  const row = db.prepare("SELECT code FROM customers WHERE code GLOB 'C[0-9]*' ORDER BY length(code) DESC, code DESC LIMIT 1").get();
  const n = row ? Number(String(row.code).replace(/\D/g, '')) || 0 : 0;
  return (seq) => `C${String(n + seq).padStart(4, '0')}`;
}

// ---------- 客户导入 ----------
export function importCustomers(rows, { dryRun = false, ownerId = null } = {}) {
  const db = getDb();
  if (!rows.length) throw Object.assign(new Error('CSV 没有数据行'), { status: 400 });
  const idx = mapHeaders(rows[0], 'customers');
  if (idx.name === undefined) {
    throw Object.assign(new Error(`未找到「客户名称」列。识别到的表头：${rows[0].join(' / ')}`), { status: 400 });
  }
  const users = db.prepare('SELECT id, name FROM users').all();
  const userByName = new Map(users.map((u) => [u.name, u.id]));
  const existing = db.prepare('SELECT name, name_en FROM customers').all();
  const seen = new Set(existing.flatMap((c) => [c.name, c.name_en].filter(Boolean)));
  const now = NOW();
  const codeOf = nextCustomerCode(db);

  const result = { total: 0, created: 0, skipped: 0, contacts: 0, errors: [], duplicates: [] };
  const ins = db.prepare(`INSERT INTO customers
    (code, name, name_en, country, region, industry, website, level, source, status, owner_id, protection_until, tax_id, address, remark, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insContact = db.prepare(`INSERT INTO contacts (customer_id, name, title, email, phone, whatsapp, linkedin, is_kp, created_at)
    VALUES (?, ?, '', ?, ?, '', '', ?, ?)`);

  db.exec('BEGIN');
  try {
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      result.total += 1;
      const name = pick(row, idx, 'name');
      const nameEn = pick(row, idx, 'name_en');
      if (!name) { result.errors.push({ line: r + 1, message: '客户名称为空' }); continue; }
      if (seen.has(name) || (nameEn && seen.has(nameEn))) {
        result.skipped += 1;
        result.duplicates.push({ line: r + 1, name });
        continue;
      }
      const level = pick(row, idx, 'level').toUpperCase();
      const status = pick(row, idx, 'status');
      const ownerName = pick(row, idx, 'owner_name');
      const owner = userByName.get(ownerName) ?? (ownerId ?? users[0]?.id ?? null);
      const code = codeOf(result.created + 1);
      const info = ins.run(
        code, name, nameEn, pick(row, idx, 'country'), pick(row, idx, 'region'), pick(row, idx, 'industry'),
        pick(row, idx, 'website'), LEVELS.has(level) ? level : 'B', pick(row, idx, 'source') || '导入',
        STATUSES.has(status) ? status : '跟进中', owner, toDate(pick(row, idx, 'protection_until')) || null,
        pick(row, idx, 'tax_id'), pick(row, idx, 'address'), pick(row, idx, 'remark'), now,
      );
      const id = Number(info.lastInsertRowid);
      seen.add(name);
      if (nameEn) seen.add(nameEn);
      result.created += 1;

      const cn = pick(row, idx, 'contact_name');
      if (cn) {
        insContact.run(id, cn, pick(row, idx, 'contact_email'), pick(row, idx, 'contact_phone'), 1, now);
        result.contacts += 1;
      }
    }
    if (dryRun) db.exec('ROLLBACK');
    else db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { ...result, dryRun };
}

// ---------- 海关数据导入 ----------
export function importCustoms(rows, { dryRun = false } = {}) {
  const db = getDb();
  if (!rows.length) throw Object.assign(new Error('CSV 没有数据行'), { status: 400 });
  const idx = mapHeaders(rows[0], 'customs');
  if (idx.importer === undefined) {
    throw Object.assign(new Error(`未找到「采购商」列。识别到的表头：${rows[0].join(' / ')}`), { status: 400 });
  }
  const now = NOW();
  const customers = db.prepare('SELECT id, name_en, name FROM customers').all();
  const byName = new Map();
  for (const c of customers) {
    if (c.name_en) byName.set(c.name_en.toLowerCase(), c.id);
    if (c.name) byName.set(c.name.toLowerCase(), c.id);
  }
  const result = { total: 0, created: 0, matched: 0, errors: [], skipped: 0 };
  const ins = db.prepare(`INSERT INTO customs
    (customer_id, hs_code, product, importer, importer_country, exporter, exporter_country, trade_type, teu, weight_t, amount_usd, shipment_date, carrier, source_country, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const dupCheck = db.prepare(`SELECT 1 FROM customs WHERE importer = ? AND hs_code = ? AND shipment_date = ? AND amount_usd = ?`);

  db.exec('BEGIN');
  try {
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      result.total += 1;
      const importer = pick(row, idx, 'importer');
      if (!importer) { result.errors.push({ line: r + 1, message: '采购商为空' }); continue; }
      const date = toDate(pick(row, idx, 'shipment_date'));
      if (!date) { result.errors.push({ line: r + 1, message: '日期无法识别' }); continue; }
      const hs = pick(row, idx, 'hs_code');
      const amount = toNum(pick(row, idx, 'amount_usd'));
      if (dupCheck.get(importer, hs, date, amount)) { result.skipped += 1; continue; }
      const cid = byName.get(importer.toLowerCase()) ?? null;
      if (cid) result.matched += 1;
      ins.run(cid, hs, pick(row, idx, 'product'), importer, pick(row, idx, 'importer_country'),
        pick(row, idx, 'exporter'), '', '进口', toNum(pick(row, idx, 'teu')), toNum(pick(row, idx, 'weight_t')),
        amount, date, pick(row, idx, 'carrier'), '', now);
      result.created += 1;
    }
    if (dryRun) db.exec('ROLLBACK');
    else db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { ...result, dryRun };
}

// ---------- 模板与清空 ----------
export function customerCsvTemplate() {
  return '客户名称,英文名称,国家,行业,客户分级,线索来源,负责人,联系人,邮箱,电话,备注\n' +
    '示例五金公司,Example Hardware GmbH,德国,机械五金,A,海关数据,王芳,Anna Weber,anna@example.com,+49 40 1234567,由海关数据开发\n';
}

export function customsCsvTemplate() {
  return '采购商,采购商国家,HS编码,商品,日期,TEU,金额,承运\n' +
    'Example Hardware GmbH,德国,8481804090,不锈钢阀门,2026-10-01,2,45200,COSCO 1234\n';
}

// 清空业务数据（保留用户与模板），用于把演示数据换成真实数据。
// 同时写入 cleared_at 标记：之后重启服务不会再把演示数据灌回来；
// 用户表保留（账号不随业务数据清空），seed() 用 INSERT OR IGNORE 写入，不会主键冲突。
export function clearBusinessData() {
  const db = getDb();
  db.exec('PRAGMA foreign_keys = OFF');
  for (const t of ['quotation_items', 'quotations', 'orders', 'handovers', 'activity_targets', 'activities', 'followups', 'opportunities', 'customs', 'contacts', 'customers']) {
    db.exec(`DELETE FROM ${t}`);
  }
  db.exec("DELETE FROM meta WHERE key IN ('seeded_at', 'cleared_at')");
  db.exec('PRAGMA foreign_keys = ON');
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('cleared_at', new Date().toISOString());
  return { cleared: true };
}

// 数据库是否处于「用户自己录入数据」的状态（不需要灌演示数据）
export function isUserDataMode(db) {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'cleared_at'").get();
  return Boolean(row);
}
