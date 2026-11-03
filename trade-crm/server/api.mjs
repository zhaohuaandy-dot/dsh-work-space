// 业务 API：客户管理、海关数据分析、商机、跟进、营销活动、模板、客保与公海、移交。
import { getDb, NOW } from './db.mjs';

const json = (status, body) => ({ status, body });

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => new ApiError(400, msg);
const notFound = (msg = '记录不存在') => new ApiError(404, msg);

function num(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
function require_(v, name) {
  if (v === undefined || v === null || String(v).trim() === '') throw bad(`缺少必填字段：${name}`);
  return String(v).trim();
}
function like(v) { return `%${String(v ?? '').trim()}%`; }

export const CURRENT_USER_ID = 1;

const CUSTOMER_FIELDS = ['name', 'name_en', 'country', 'region', 'industry', 'website', 'level', 'source', 'status', 'owner_id', 'protection_until', 'tax_id', 'address', 'remark'];

function customerSelect() {
  return `SELECT c.*, u.name AS owner_name,
      (SELECT COUNT(*) FROM contacts ct WHERE ct.customer_id = c.id) AS contact_count,
      (SELECT COUNT(*) FROM customs s WHERE s.customer_id = c.id) AS customs_count,
      (SELECT COUNT(*) FROM followups f WHERE f.customer_id = c.id) AS followup_count
    FROM customers c LEFT JOIN users u ON u.id = c.owner_id`;
}

export function stats(db = getDb()) {
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const total = one('SELECT COUNT(*) c FROM customers').c;
  const active = one("SELECT COUNT(*) c FROM customers WHERE status = '跟进中'").c;
  const won = one("SELECT COUNT(*) c FROM customers WHERE status = '已成交'").c;
  const sea = one("SELECT COUNT(*) c FROM customers WHERE status = '公海'").c;
  const customs = one('SELECT COUNT(*) c, COALESCE(SUM(amount_usd),0) s, COALESCE(SUM(teu),0) t FROM customs');
  const opp = one("SELECT COUNT(*) c, COALESCE(SUM(amount_usd),0) s FROM opportunities WHERE stage NOT IN ('赢单','输单')");
  const oppWon = one("SELECT COUNT(*) c, COALESCE(SUM(amount_usd),0) s FROM opportunities WHERE stage = '赢单'");
  const oppLost = one("SELECT COUNT(*) c FROM opportunities WHERE stage = '输单'");
  const thisMonth = NOW().slice(0, 7);
  const followMonth = one('SELECT COUNT(*) c FROM followups WHERE substr(created_at,1,7) = ?', thisMonth).c;
  const dueProtect = one("SELECT COUNT(*) c FROM customers WHERE status = '跟进中' AND protection_until IS NOT NULL AND protection_until <= date('now','+30 day')").c;
  const act = one("SELECT COUNT(*) c, COALESCE(SUM(sent_count),0) sent, COALESCE(SUM(open_count),0) opened, COALESCE(SUM(reply_count),0) replied FROM activities WHERE status = '进行中'");
  const byLevel = db.prepare('SELECT level, COUNT(*) c FROM customers GROUP BY level ORDER BY level').all();
  const byStatus = db.prepare('SELECT status, COUNT(*) c FROM customers GROUP BY status').all();
  const byCountry = db.prepare('SELECT importer_country name, COUNT(*) c, SUM(amount_usd) amount FROM customs GROUP BY importer_country ORDER BY amount DESC LIMIT 8').all();
  const trend = db.prepare(`SELECT substr(created_at,1,7) month, COUNT(*) c FROM customers WHERE created_at >= date('now','-6 month') GROUP BY month ORDER BY month`).all();
  return {
    customers: { total, active, won, sea, followMonth, dueProtect },
    customs: { shipments: customs.c, amount: Math.round(customs.s), teu: customs.t },
    opportunities: { open: opp.c, openAmount: Math.round(opp.s), won: oppWon.c, wonAmount: Math.round(oppWon.s), lost: oppLost.c },
    activities: { running: act.c, sent: act.sent, opened: act.opened, replied: act.replied },
    byLevel, byStatus, byCountry, trend,
  };
}

export function listCustomers(q) {
  const db = getDb();
  const where = [];
  const params = [];
  for (const [col, key] of [['country', 'country'], ['level', 'level'], ['source', 'source'], ['status', 'status']]) {
    if (q[key]) { where.push(`c.${col} = ?`); params.push(String(q[key])); }
  }
  if (q.industry) { where.push('c.industry = ?'); params.push(String(q.industry)); }
  if (q.owner) { where.push('c.owner_id = ?'); params.push(num(q.owner)); }
  if (q.sea === '1') where.push("c.status = '公海'");
  if (q.keyword) {
    where.push('(c.name LIKE ? OR c.name_en LIKE ? OR c.code LIKE ? OR c.country LIKE ? OR c.industry LIKE ? OR EXISTS (SELECT 1 FROM contacts k WHERE k.customer_id = c.id AND (k.name LIKE ? OR k.email LIKE ?)))');
    const k = like(q.keyword);
    params.push(k, k, k, k, k, k, k);
  }
  const page = Math.max(1, num(q.page, 1));
  const size = Math.min(100, Math.max(5, num(q.size, 20)));
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) c FROM customers c ${whereSql}`).get(...params).c;
  const order = q.scope === 'follow' ? 'c.last_follow_at DESC' : 'c.id DESC';
  const rows = db.prepare(`${customerSelect()} ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params, size, (page - 1) * size);
  return { total, page, size, items: rows };
}

export function customerDetail(id) {
  const db = getDb();
  const customer = db.prepare(`${customerSelect()} WHERE c.id = ?`).get(num(id));
  if (!customer) throw notFound();
  const contacts = db.prepare('SELECT * FROM contacts WHERE customer_id = ? ORDER BY is_kp DESC, id').all(customer.id);
  const customs = db.prepare('SELECT * FROM customs WHERE customer_id = ? ORDER BY shipment_date DESC').all(customer.id);
  const followups = db.prepare('SELECT f.*, u.name AS user_name FROM followups f LEFT JOIN users u ON u.id = f.user_id WHERE f.customer_id = ? ORDER BY f.created_at DESC').all(customer.id);
  const opportunities = db.prepare(`SELECT o.*, u.name AS owner_name FROM opportunities o LEFT JOIN users u ON u.id = o.owner_id WHERE o.customer_id = ? ORDER BY o.id DESC`).all(customer.id);
  const activities = db.prepare('SELECT * FROM activity_targets WHERE customer_id = ? ORDER BY id DESC').all(customer.id);
  const handovers = db.prepare(`SELECT h.*, a.name AS from_name, b.name AS to_name FROM handovers h
      LEFT JOIN users a ON a.id = h.from_user_id LEFT JOIN users b ON b.id = h.to_user_id
      WHERE h.customer_id = ? ORDER BY h.id DESC`).all(customer.id);
  return { customer, contacts, customs, followups, opportunities, activities, handovers };
}

export function createCustomer(body) {
  const db = getDb();
  const now = NOW();
  const nextCode = `C${String((db.prepare('SELECT COALESCE(MAX(id),0)+1 n FROM customers').get().n)).padStart(4, '0')}`;
  const stmt = db.prepare(`INSERT INTO customers (code, name, name_en, country, region, industry, website, level, source, status, owner_id, protection_until, tax_id, address, remark, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const r = stmt.run(
    nextCode, require_(body.name, '客户名称'), body.name_en ?? '', body.country ?? '', body.region ?? '', body.industry ?? '',
    body.website ?? '', ['A', 'B', 'C', 'D'].includes(body.level) ? body.level : 'B', body.source ?? '自主开发',
    ['跟进中', '已成交', '公海'].includes(body.status) ? body.status : '跟进中',
    body.owner_id ? num(body.owner_id) : CURRENT_USER_ID, body.protection_until || null, body.tax_id ?? '', body.address ?? '', body.remark ?? '', now,
  );
  const id = Number(r.lastInsertRowid);
  if (Array.isArray(body.contacts)) for (const c of body.contacts) addContact(id, c);
  return { status: 201, body: { id, code: nextCode } };
}

export function updateCustomer(id, body) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(num(id));
  if (!existing) throw notFound();
  const sets = [];
  const params = [];
  for (const f of CUSTOMER_FIELDS) {
    if (!(f in body)) continue;
    let v = body[f];
    if (f === 'name') v = require_(v, '客户名称');
    if (f === 'owner_id') v = v === null || v === '' ? null : num(v);
    sets.push(`${f} = ?`);
    params.push(v ?? null);
  }
  if (!sets.length) throw bad('没有可更新字段');
  db.prepare(`UPDATE customers SET ${sets.join(', ')} WHERE id = ?`).run(...params, existing.id);
  return { status: 200, body: customerDetail(existing.id).customer };
}

export function deleteCustomer(id) {
  const db = getDb();
  const r = db.prepare('DELETE FROM customers WHERE id = ?').run(num(id));
  if (!r.changes) throw notFound();
  return { status: 200, body: { deleted: true } };
}

export function addContact(customerId, body) {
  const db = getDb();
  const cid = num(customerId);
  if (!db.prepare('SELECT 1 FROM customers WHERE id = ?').get(cid)) throw notFound('客户不存在');
  const r = db.prepare(`INSERT INTO contacts (customer_id, name, title, email, phone, whatsapp, linkedin, is_kp, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(cid, require_(body.name, '联系人姓名'), body.title ?? '', body.email ?? '', body.phone ?? '', body.whatsapp ?? '', body.linkedin ?? '', body.is_kp ? 1 : 0, NOW());
  return { status: 201, body: { id: Number(r.lastInsertRowid) } };
}

export function deleteContact(customerId, contactId) {
  const db = getDb();
  const r = db.prepare('DELETE FROM contacts WHERE id = ? AND customer_id = ?').run(num(contactId), num(customerId));
  if (!r.changes) throw notFound();
  return { status: 200, body: { deleted: true } };
}

export function addFollowup(customerId, body) {
  const db = getDb();
  const cid = num(customerId);
  if (!db.prepare('SELECT 1 FROM customers WHERE id = ?').get(cid)) throw notFound('客户不存在');
  const now = NOW();
  const r = db.prepare(`INSERT INTO followups (customer_id, opportunity_id, type, content, user_id, next_plan, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(cid, body.opportunity_id ? num(body.opportunity_id) : null, body.type ?? '电话', require_(body.content, '跟进内容'),
      body.user_id ? num(body.user_id) : CURRENT_USER_ID, body.next_plan ?? '', now);
  db.prepare('UPDATE customers SET last_follow_at = ? WHERE id = ?').run(now, cid);
  return { status: 201, body: { id: Number(r.lastInsertRowid) } };
}

export function deleteFollowup(id) {
  const db = getDb();
  const f = db.prepare('SELECT * FROM followups WHERE id = ?').get(num(id));
  if (!f) throw notFound();
  db.prepare('DELETE FROM followups WHERE id = ?').run(f.id);
  const last = db.prepare('SELECT created_at FROM followups WHERE customer_id = ? ORDER BY created_at DESC LIMIT 1').get(f.customer_id);
  db.prepare('UPDATE customers SET last_follow_at = ? WHERE id = ?').run(last ? last.created_at : null, f.customer_id);
  return { status: 200, body: { deleted: true } };
}

export function listUsers() {
  return { status: 200, body: { items: getDb().prepare('SELECT * FROM users ORDER BY id').all() } };
}

export function customerOptions() {
  const db = getDb();
  const one = (sql) => db.prepare(sql).all().map((r) => r.v);
  return {
    status: 200,
    body: {
      countries: one("SELECT DISTINCT importer_country v FROM customs WHERE importer_country <> '' ORDER BY v"),
      industries: one("SELECT DISTINCT industry v FROM customers WHERE industry <> '' ORDER BY v"),
      regions: one("SELECT DISTINCT region v FROM customers WHERE region <> '' ORDER BY v"),
      levels: ['A', 'B', 'C', 'D'],
      statuses: ['跟进中', '已成交', '公海', '已流失'],
      sources: one("SELECT DISTINCT source v FROM customers WHERE source <> '' ORDER BY v"),
      followTypes: ['电话', '邮件', 'WhatsApp', '展会', '拜访', '其他'],
      stages: ['初步接触', '需求确认', '报价中', '谈判中', '赢单', '输单'],
      users: db.prepare('SELECT id, name, role, dept FROM users ORDER BY id').all(),
    },
  };
}

// ---------- 海关数据分析 ----------
export function customsAnalysis(q) {
  const db = getDb();
  const where = [];
  const params = [];
  if (q.keyword) {
    where.push('(s.importer LIKE ? OR s.exporter LIKE ? OR s.product LIKE ? OR s.hs_code LIKE ?)');
    const k = like(q.keyword);
    params.push(k, k, k, k);
  }
  if (q.country) { where.push('s.importer_country = ?'); params.push(String(q.country)); }
  if (q.hs) { where.push('s.hs_code LIKE ?'); params.push(`${String(q.hs)}%`); }
  if (q.customer_id) { where.push('s.customer_id = ?'); params.push(num(q.customer_id)); }
  if (q.from) { where.push('s.shipment_date >= ?'); params.push(String(q.from)); }
  if (q.to) { where.push('s.shipment_date <= ?'); params.push(String(q.to)); }
  if (q.mine === '1') where.push(`s.customer_id IS NOT NULL`);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const summary = db.prepare(`SELECT COUNT(*) shipments, COALESCE(SUM(s.teu),0) teu, COALESCE(SUM(s.weight_t),0) weight, COALESCE(SUM(s.amount_usd),0) amount,
      COUNT(DISTINCT s.importer_country) countries, COUNT(DISTINCT s.hs_code) hs_codes FROM customs s ${whereSql}`).get(...params);

  // 采购商排行：区分是否已建档（潜在客户）
  const importerSql = `SELECT s.importer name, s.importer_country country, COUNT(*) shipments, SUM(s.teu) teu, SUM(s.amount_usd) amount,
      MAX(s.shipment_date) last_shipment, s.customer_id, c.code customer_code
    FROM customs s LEFT JOIN customers c ON c.id = s.customer_id ${whereSql}
    GROUP BY s.importer, s.importer_country ORDER BY amount DESC LIMIT 12`;
  const importers = db.prepare(importerSql).all(...params).map((r) => ({
    ...r, amount: Math.round(r.amount), matched: Boolean(r.customer_id), potential: !r.customer_id,
  }));

  // 潜在买家推荐：全部海关数据中尚未建档、且按金额排序的采购商（忽略当前筛选，始终基于我方进口记录）
  const potentials = db.prepare(`SELECT s.importer name, s.importer_country country,
      COUNT(*) shipments, MAX(s.shipment_date) last_shipment, SUM(s.amount_usd) amount,
      (SELECT s2.hs_code FROM customs s2 WHERE s2.importer = s.importer AND s2.importer_country = s.importer_country
        ORDER BY s2.amount_usd DESC LIMIT 1) top_hs,
      (SELECT s2.product FROM customs s2 WHERE s2.importer = s.importer AND s2.importer_country = s.importer_country
        ORDER BY s2.amount_usd DESC LIMIT 1) top_product
    FROM customs s WHERE s.customer_id IS NULL AND s.trade_type = '进口'
    GROUP BY s.importer, s.importer_country ORDER BY amount DESC LIMIT 10`).all().map((r) => ({ ...r, amount: Math.round(r.amount) }));

  const byCountry = db.prepare(`SELECT s.importer_country name, COUNT(*) shipments, SUM(s.teu) teu, SUM(s.amount_usd) amount
    FROM customs s ${whereSql} GROUP BY s.importer_country ORDER BY amount DESC LIMIT 10`).all(...params).map((r) => ({ ...r, amount: Math.round(r.amount) }));
  const byProduct = db.prepare(`SELECT s.hs_code, s.product name, COUNT(*) shipments, SUM(s.teu) teu, SUM(s.amount_usd) amount
    FROM customs s ${whereSql} GROUP BY s.hs_code, s.product ORDER BY amount DESC LIMIT 8`).all(...params).map((r) => ({ ...r, amount: Math.round(r.amount) }));
  const byMonth = db.prepare(`SELECT substr(s.shipment_date,1,7) month, SUM(s.amount_usd) amount, SUM(s.teu) teu, COUNT(*) shipments
    FROM customs s ${whereSql} GROUP BY month ORDER BY month`).all(...params).map((r) => ({ ...r, amount: Math.round(r.amount) }));
  const byExporter = db.prepare(`SELECT s.exporter name, s.exporter_country country, COUNT(*) shipments, SUM(s.amount_usd) amount
    FROM customs s ${whereSql} GROUP BY s.exporter, s.exporter_country ORDER BY amount DESC LIMIT 8`).all(...params).map((r) => ({ ...r, amount: Math.round(r.amount) }));

  // 贸易监测：近 90 天到港的潜在买家提醒
  const alerts = db.prepare(`SELECT s.id, s.importer, s.importer_country, s.product, s.hs_code, s.shipment_date, s.amount_usd
    FROM customs s WHERE s.customer_id IS NULL AND s.shipment_date >= date('now','-90 day') ORDER BY s.shipment_date DESC LIMIT 6`).all();

  return {
    status: 200,
    body: {
      summary: { ...summary, amount: Math.round(summary.amount), teu: Math.round(summary.teu * 10) / 10, weight: Math.round(summary.weight) },
      importers, potentials, byCountry, byProduct, byMonth, byExporter, alerts,
    },
  };
}

export function listCustoms(q) {
  const db = getDb();
  const where = [];
  const params = [];
  if (q.keyword) {
    where.push('(s.importer LIKE ? OR s.product LIKE ? OR s.hs_code LIKE ?)');
    const k = like(q.keyword);
    params.push(k, k, k);
  }
  if (q.country) { where.push('s.importer_country = ?'); params.push(String(q.country)); }
  if (q.customer_id) { where.push('s.customer_id = ?'); params.push(num(q.customer_id)); }
  if (q.potential === '1') where.push('s.customer_id IS NULL');
  const page = Math.max(1, num(q.page, 1));
  const size = Math.min(200, Math.max(5, num(q.size, 20)));
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) c FROM customs s ${whereSql}`).get(...params).c;
  const items = db.prepare(`SELECT s.*, c.name customer_name FROM customs s LEFT JOIN customers c ON c.id = s.customer_id
    ${whereSql} ORDER BY s.shipment_date DESC, s.id DESC LIMIT ? OFFSET ?`).all(...params, size, (page - 1) * size);
  return { status: 200, body: { total, page, size, items } };
}

// 从海关数据一键建档（贸易大数据获客 → 客户档案）
export function convertImporter(body) {
  const db = getDb();
  const importer = require_(body.importer, '采购商');
  const country = body.country ?? '';
  const dup = db.prepare("SELECT id, code FROM customers WHERE name_en = ? AND country = ?").get(importer, country);
  if (dup) throw new ApiError(409, `该采购商已建档：${dup.code}`);
  const base = String(importer).replace(/\s+(GmbH|Inc\.?|Ltd\.?|LLC|S\.r\.l\.|S\.L\.|Ltda\.?|B\.V\.|Sp\. z o\.o\.|Pvt\. Ltd|SAS|Pty Ltd|Co\., Ltd|A\.Ş\.|S\.A\. de C\.V\.)$/i, '').trim();
  const r = createCustomer({
    name: `${country} ${base.replace(/\s+/g, '')}公司`,
    name_en: importer,
    country,
    region: body.region ?? '',
    industry: body.industry ?? '',
    source: '海关数据',
    level: body.level ?? 'B',
    status: '跟进中',
    owner_id: body.owner_id ? num(body.owner_id) : CURRENT_USER_ID,
    remark: '由海关数据分析模块转档',
  });
  const id = r.body.id;
  if (body.customs_id) db.prepare('UPDATE customs SET customer_id = ? WHERE id = ?').run(id, num(body.customs_id));
  else db.prepare('UPDATE customs SET customer_id = ? WHERE importer = ? AND importer_country = ?').run(id, importer, country);
  return { status: 201, body: { ...r.body, customer: customerDetail(id).customer } };
}

// ---------- 公海与客保 ----------
export function releaseToSea(id, body = {}) {
  const db = getDb();
  const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(num(id));
  if (!c) throw notFound();
  db.prepare("UPDATE customers SET status = '公海', owner_id = NULL, protection_until = NULL WHERE id = ?").run(c.id);
  return { status: 200, body: { ...c, status: '公海', owner_id: null, protection_until: null } };
}

export function claimCustomer(id, body = {}) {
  const db = getDb();
  const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(num(id));
  if (!c) throw notFound();
  if (c.status !== '公海') throw bad('只有公海客户可以领取');
  const uid = body.user_id ? num(body.user_id) : CURRENT_USER_ID;
  const protectDays = Math.min(365, Math.max(1, num(body.protection_days, 30)));
  const d = new Date();
  d.setDate(d.getDate() + protectDays);
  const until = d.toISOString().slice(0, 10);
  db.prepare("UPDATE customers SET status = '跟进中', owner_id = ?, protection_until = ? WHERE id = ?").run(uid, until, c.id);
  return { status: 200, body: { ...c, status: '跟进中', owner_id: uid, protection_until: until } };
}

export function renewProtection(id, body = {}) {
  const db = getDb();
  const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(num(id));
  if (!c) throw notFound();
  const protectDays = Math.min(365, Math.max(1, num(body.protection_days, 30)));
  const d = new Date();
  d.setDate(d.getDate() + protectDays);
  const until = d.toISOString().slice(0, 10);
  db.prepare('UPDATE customers SET protection_until = ? WHERE id = ?').run(until, c.id);
  return { status: 200, body: { ...c, protection_until: until } };
}

export function transferCustomer(id, body) {
  const db = getDb();
  const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(num(id));
  if (!c) throw notFound();
  const to = num(require_(body.to_user_id, '接收人'));
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(to)) throw bad('接收人不存在');
  const r = db.prepare('INSERT INTO handovers (customer_id, from_user_id, to_user_id, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(c.id, c.owner_id ?? CURRENT_USER_ID, to, body.reason ?? '', body.auto_accept ? '已接收' : '待接收', NOW());
  if (body.auto_accept) db.prepare('UPDATE customers SET owner_id = ? WHERE id = ?').run(to, c.id);
  return { status: 201, body: { id: Number(r.lastInsertRowid), status: body.auto_accept ? '已接收' : '待接收' } };
}

export function listHandovers(q) {
  const db = getDb();
  const where = [];
  const params = [];
  if (q.status) { where.push('h.status = ?'); params.push(String(q.status)); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const items = db.prepare(`SELECT h.*, a.name AS from_name, b.name AS to_name, c.name AS customer_name, c.code AS customer_code
    FROM handovers h LEFT JOIN users a ON a.id = h.from_user_id LEFT JOIN users b ON b.id = h.to_user_id
    LEFT JOIN customers c ON c.id = h.customer_id ${whereSql} ORDER BY h.id DESC LIMIT 100`).all(...params);
  return { status: 200, body: { items } };
}

export function acceptHandover(id) {
  const db = getDb();
  const h = db.prepare('SELECT * FROM handovers WHERE id = ?').get(num(id));
  if (!h) throw notFound();
  if (h.status === '已接收') throw bad('该移交已接收');
  db.prepare("UPDATE handovers SET status = '已接收' WHERE id = ?").run(h.id);
  db.prepare('UPDATE customers SET owner_id = ? WHERE id = ?').run(h.to_user_id, h.customer_id);
  return { status: 200, body: { ...h, status: '已接收' } };
}

// ---------- 商机 ----------
export function listOpportunities(q) {
  const db = getDb();
  const where = [];
  const params = [];
  if (q.stage) { where.push('o.stage = ?'); params.push(String(q.stage)); }
  if (q.owner) { where.push('o.owner_id = ?'); params.push(num(q.owner)); }
  if (q.keyword) { where.push('(o.title LIKE ? OR o.code LIKE ? OR c.name LIKE ? OR c.name_en LIKE ?)'); const k = like(q.keyword); params.push(k, k, k, k); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const items = db.prepare(`SELECT o.*, c.name customer_name, c.name_en customer_name_en, c.country, u.name owner_name
    FROM opportunities o LEFT JOIN customers c ON c.id = o.customer_id LEFT JOIN users u ON u.id = o.owner_id
    ${whereSql} ORDER BY o.id DESC LIMIT 200`).all(...params);
  const stages = ['初步接触', '需求确认', '报价中', '谈判中', '赢单', '输单'];
  const pipeline = stages.map((s) => {
    const rows = items.filter((i) => i.stage === s);
    return { stage: s, count: rows.length, amount: rows.reduce((a, b) => a + b.amount_usd, 0) };
  });
  return { status: 200, body: { items, pipeline } };
}

export function createOpportunity(body) {
  const db = getDb();
  const customerId = num(require_(body.customer_id, '客户'));
  if (!db.prepare('SELECT 1 FROM customers WHERE id = ?').get(customerId)) throw bad('客户不存在');
  const n = db.prepare('SELECT COALESCE(MAX(id),0)+1 n FROM opportunities').get().n;
  const now = NOW();
  const code = `OPP${now.slice(0, 4)}${String(n).padStart(4, '0')}`;
  const r = db.prepare(`INSERT INTO opportunities (code, title, customer_id, stage, amount_usd, win_rate, expected_close, owner_id, source, created_at, stage_changed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(code, require_(body.title, '商机名称'), customerId, body.stage ?? '初步接触', num(body.amount_usd), num(body.win_rate, 30),
      body.expected_close || null, body.owner_id ? num(body.owner_id) : CURRENT_USER_ID, body.source ?? '', now, now);
  return { status: 201, body: { id: Number(r.lastInsertRowid), code } };
}

const WIN_RATE = { 初步接触: 15, 需求确认: 30, 报价中: 50, 谈判中: 75, 赢单: 100, 输单: 0 };

export function updateOpportunity(id, body) {
  const db = getDb();
  const o = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(num(id));
  if (!o) throw notFound();
  const sets = [];
  const params = [];
  for (const f of ['title', 'stage', 'amount_usd', 'win_rate', 'expected_close', 'owner_id', 'source']) {
    if (!(f in body)) continue;
    sets.push(`${f} = ?`);
    params.push(body[f] ?? null);
  }
  if (body.stage && body.stage !== o.stage) {
    sets.push('stage_changed_at = ?');
    params.push(NOW());
    if (!('win_rate' in body)) { sets.push('win_rate = ?'); params.push(WIN_RATE[body.stage] ?? o.win_rate); }
  }
  if (!sets.length) throw bad('没有可更新字段');
  db.prepare(`UPDATE opportunities SET ${sets.join(', ')} WHERE id = ?`).run(...params, o.id);
  return { status: 200, body: db.prepare('SELECT * FROM opportunities WHERE id = ?').get(o.id) };
}

// ---------- 营销活动 ----------
export function listActivities() {
  const db = getDb();
  const items = db.prepare(`SELECT a.*, u.name owner_name FROM activities a LEFT JOIN users u ON u.id = a.owner_id ORDER BY a.id DESC`).all()
    .map((a) => ({ ...a, open_rate: a.sent_count ? Math.round((a.open_count / a.sent_count) * 1000) / 10 : 0, reply_rate: a.sent_count ? Math.round((a.reply_count / a.sent_count) * 1000) / 10 : 0 }));
  return { status: 200, body: { items } };
}

export function activityDetail(id) {
  const db = getDb();
  const a = db.prepare('SELECT * FROM activities WHERE id = ?').get(num(id));
  if (!a) throw notFound();
  const targets = db.prepare(`SELECT t.*, c.name customer_name, c.name_en, c.country FROM activity_targets t JOIN customers c ON c.id = t.customer_id
    WHERE t.activity_id = ? ORDER BY t.status, t.id`).all(a.id);
  const counts = {};
  for (const t of targets) counts[t.status] = (counts[t.status] ?? 0) + 1;
  return { status: 200, body: { activity: a, targets, counts } };
}

export function createActivity(body) {
  const db = getDb();
  const now = NOW();
  const r = db.prepare(`INSERT INTO activities (name, kind, status, target_count, sent_count, open_count, reply_count, start_date, end_date, owner_id, created_at)
      VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?)`)
    .run(require_(body.name, '活动名称'), body.kind ?? '邮件营销', body.status ?? '进行中', 0, body.start_date || now.slice(0, 10), body.end_date || null,
      body.owner_id ? num(body.owner_id) : CURRENT_USER_ID, now);
  const id = Number(r.lastInsertRowid);
  if (Array.isArray(body.customer_ids)) addActivityTargets(id, body.customer_ids);
  return { status: 201, body: { id } };
}

export function addActivityTargets(activityId, customerIds) {
  const db = getDb();
  const act = db.prepare('SELECT * FROM activities WHERE id = ?').get(num(activityId));
  if (!act) throw notFound('活动不存在');
  const ins = db.prepare('INSERT INTO activity_targets (activity_id, customer_id, status, updated_at) VALUES (?, ?, ?, ?)');
  let added = 0;
  for (const cid of customerIds) {
    const id = num(cid);
    if (!db.prepare('SELECT 1 FROM customers WHERE id = ?').get(id)) continue;
    if (db.prepare('SELECT 1 FROM activity_targets WHERE activity_id = ? AND customer_id = ?').get(act.id, id)) continue;
    ins.run(act.id, id, '待发送', NOW());
    added++;
  }
  db.prepare('UPDATE activities SET target_count = (SELECT COUNT(*) FROM activity_targets WHERE activity_id = ?) WHERE id = ?').run(act.id, act.id);
  return { status: 200, body: { added } };
}

const TARGET_FLOW = { '待发送': '已发送', '已发送': '已打开', '已打开': '已回复' };
export function advanceActivity(activityId) {
  const db = getDb();
  const act = db.prepare('SELECT * FROM activities WHERE id = ?').get(num(activityId));
  if (!act) throw notFound('活动不存在');
  let moved = 0;
  for (const t of db.prepare('SELECT * FROM activity_targets WHERE activity_id = ?').all(act.id)) {
    const next = TARGET_FLOW[t.status];
    if (!next) continue;
    db.prepare('UPDATE activity_targets SET status = ?, updated_at = ? WHERE id = ?').run(next, NOW(), t.id);
    moved++;
  }
  const counts = db.prepare(`SELECT
      SUM(status <> '待发送') sent, SUM(status IN ('已打开','已回复')) opened, SUM(status = '已回复') replied
    FROM activity_targets WHERE activity_id = ?`).get(act.id);
  db.prepare('UPDATE activities SET sent_count = ?, open_count = ?, reply_count = ? WHERE id = ?').run(counts.sent ?? 0, counts.opened ?? 0, counts.replied ?? 0, act.id);
  return { status: 200, body: activityDetail(act.id).body };
}

// ---------- 报价单与订单（交易管理） ----------
const QUOTE_STATUS = ['草稿', '待审批', '已发出', '已接受', '已拒绝', '已过期'];
const ORDER_STATUS = ['待生产', '生产中', '待出运', '已出运', '已签收', '已取消'];

function quotationTotal(db, id) {
  const r = db.prepare('SELECT COALESCE(SUM(qty * unit_price),0) total FROM quotation_items WHERE quotation_id = ?').get(id);
  return Math.round(r.total * 100) / 100;
}

export function listQuotations(q) {
  const db = getDb();
  const where = [];
  const params = [];
  if (q.status) { where.push('qt.status = ?'); params.push(String(q.status)); }
  if (q.customer_id) { where.push('qt.customer_id = ?'); params.push(num(q.customer_id)); }
  if (q.keyword) {
    where.push('(qt.code LIKE ? OR qt.title LIKE ? OR c.name LIKE ? OR c.name_en LIKE ?)');
    const k = like(q.keyword);
    params.push(k, k, k, k);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const items = db.prepare(`SELECT qt.*, c.name customer_name, c.name_en customer_name_en, c.country, u.name owner_name,
      (SELECT COALESCE(SUM(i.qty * i.unit_price),0) FROM quotation_items i WHERE i.quotation_id = qt.id) total,
      (SELECT COUNT(*) FROM quotation_items i WHERE i.quotation_id = qt.id) item_count
    FROM quotations qt LEFT JOIN customers c ON c.id = qt.customer_id LEFT JOIN users u ON u.id = qt.owner_id
    ${whereSql} ORDER BY qt.id DESC LIMIT 200`).all(...params).map((r) => ({ ...r, total: Math.round(r.total * 100) / 100 }));
  const byStatus = QUOTE_STATUS.map((s) => {
    const rows = items.filter((i) => i.status === s);
    return { status: s, count: rows.length, amount: Math.round(rows.reduce((a, b) => a + b.total, 0)) };
  });
  return { status: 200, body: { items, byStatus, statuses: QUOTE_STATUS } };
}

export function quotationDetail(id) {
  const db = getDb();
  const quotation = db.prepare(`SELECT qt.*, c.name customer_name, c.name_en, c.country, c.address, c.tax_id, u.name owner_name
    FROM quotations qt LEFT JOIN customers c ON c.id = qt.customer_id LEFT JOIN users u ON u.id = qt.owner_id WHERE qt.id = ?`).get(num(id));
  if (!quotation) throw notFound('报价单不存在');
  const items = db.prepare('SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY id').all(quotation.id);
  const total = Math.round(items.reduce((a, b) => a + b.qty * b.unit_price, 0) * 100) / 100;
  return { status: 200, body: { quotation: { ...quotation, total }, items } };
}

export function createQuotation(body) {
  const db = getDb();
  const customerId = num(require_(body.customer_id, '客户'));
  if (!db.prepare('SELECT 1 FROM customers WHERE id = ?').get(customerId)) throw bad('客户不存在');
  const now = NOW();
  const n = db.prepare('SELECT COALESCE(MAX(id),0)+1 n FROM quotations').get().n;
  const code = `QT${now.slice(0, 4)}${String(n).padStart(4, '0')}`;
  const r = db.prepare(`INSERT INTO quotations (code, customer_id, opportunity_id, title, currency, incoterms, port, valid_until, status, owner_id, remark, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(code, customerId, body.opportunity_id ? num(body.opportunity_id) : null, require_(body.title, '报价单标题'),
      body.currency ?? 'USD', body.incoterms ?? 'FOB', body.port ?? '', body.valid_until || null,
      QUOTE_STATUS.includes(body.status) ? body.status : '草稿', body.owner_id ? num(body.owner_id) : CURRENT_USER_ID, body.remark ?? '', now, now);
  const id = Number(r.lastInsertRowid);
  const items = Array.isArray(body.items) ? body.items : [];
  const ins = db.prepare('INSERT INTO quotation_items (quotation_id, hs_code, product, spec, qty, unit_price) VALUES (?, ?, ?, ?, ?, ?)');
  for (const it of items) {
    ins.run(id, it.hs_code ?? '', require_(it.product, '商品名称'), it.spec ?? '', Math.max(0, num(it.qty)), Math.max(0, num(it.unit_price)));
  }
  return { status: 201, body: { id, code, total: quotationTotal(db, id), itemCount: items.length } };
}

export function updateQuotationStatus(id, body) {
  const db = getDb();
  const qt = db.prepare('SELECT * FROM quotations WHERE id = ?').get(num(id));
  if (!qt) throw notFound('报价单不存在');
  const status = require_(body.status, '状态');
  if (!QUOTE_STATUS.includes(status)) throw bad(`状态必须是：${QUOTE_STATUS.join(' / ')}`);
  db.prepare('UPDATE quotations SET status = ?, updated_at = ? WHERE id = ?').run(status, NOW(), qt.id);
  return { status: 200, body: { ...qt, status, total: quotationTotal(db, qt.id) } };
}

// 由报价单转为订单
export function convertQuotation(id, body = {}) {
  const db = getDb();
  const qt = db.prepare('SELECT * FROM quotations WHERE id = ?').get(num(id));
  if (!qt) throw notFound('报价单不存在');
  if (db.prepare('SELECT 1 FROM orders WHERE quotation_id = ?').get(qt.id)) throw new ApiError(409, '该报价单已生成订单');
  const total = quotationTotal(db, qt.id);
  const now = NOW();
  const n = db.prepare('SELECT COALESCE(MAX(id),0)+1 n FROM orders').get().n;
  const code = `SO${now.slice(0, 4)}${String(n).padStart(4, '0')}`;
  const r = db.prepare(`INSERT INTO orders (code, customer_id, quotation_id, title, amount_usd, currency, incoterms, status, payment_status, deposit_paid, etd, eta, owner_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(code, qt.customer_id, qt.id, `${qt.title} · 订单`, total || num(body.amount_usd), qt.currency, qt.incoterms,
      '待生产', '未收款', 0, body.etd || null, body.eta || null, qt.owner_id ?? CURRENT_USER_ID, now, now);
  db.prepare("UPDATE quotations SET status = '已接受', updated_at = ? WHERE id = ?").run(now, qt.id);
  return { status: 201, body: { id: Number(r.lastInsertRowid), code, amount_usd: total } };
}

export function listOrders(q) {
  const db = getDb();
  const where = [];
  const params = [];
  if (q.status) { where.push('o.status = ?'); params.push(String(q.status)); }
  if (q.payment_status) { where.push('o.payment_status = ?'); params.push(String(q.payment_status)); }
  if (q.customer_id) { where.push('o.customer_id = ?'); params.push(num(q.customer_id)); }
  if (q.keyword) {
    where.push('(o.code LIKE ? OR o.title LIKE ? OR c.name LIKE ? OR c.name_en LIKE ?)');
    const k = like(q.keyword);
    params.push(k, k, k, k);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const items = db.prepare(`SELECT o.*, c.name customer_name, c.name_en customer_name_en, c.country, u.name owner_name, qt.code quotation_code
    FROM orders o LEFT JOIN customers c ON c.id = o.customer_id LEFT JOIN users u ON u.id = o.owner_id
    LEFT JOIN quotations qt ON qt.id = o.quotation_id ${whereSql} ORDER BY o.id DESC LIMIT 200`).all(...params);
  const amount = items.reduce((a, b) => a + b.amount_usd, 0);
  const paid = items.reduce((a, b) => a + b.deposit_paid, 0);
  const byStatus = ORDER_STATUS.map((s) => {
    const rows = items.filter((i) => i.status === s);
    return { status: s, count: rows.length, amount: Math.round(rows.reduce((a, b) => a + b.amount_usd, 0)) };
  });
  return { status: 200, body: { items, byStatus, statuses: ORDER_STATUS, summary: { count: items.length, amount: Math.round(amount), paid: Math.round(paid), unpaid: Math.round(amount - paid) } } };
}

export function createOrder(body) {
  const db = getDb();
  const customerId = num(require_(body.customer_id, '客户'));
  if (!db.prepare('SELECT 1 FROM customers WHERE id = ?').get(customerId)) throw bad('客户不存在');
  const now = NOW();
  const n = db.prepare('SELECT COALESCE(MAX(id),0)+1 n FROM orders').get().n;
  const code = `SO${now.slice(0, 4)}${String(n).padStart(4, '0')}`;
  const r = db.prepare(`INSERT INTO orders (code, customer_id, quotation_id, title, amount_usd, currency, incoterms, status, payment_status, deposit_paid, etd, eta, owner_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(code, customerId, body.quotation_id ? num(body.quotation_id) : null, require_(body.title, '订单标题'),
      num(body.amount_usd), body.currency ?? 'USD', body.incoterms ?? 'FOB',
      ORDER_STATUS.includes(body.status) ? body.status : '待生产', '未收款', 0,
      body.etd || null, body.eta || null, body.owner_id ? num(body.owner_id) : CURRENT_USER_ID, now, now);
  return { status: 201, body: { id: Number(r.lastInsertRowid), code } };
}

export function updateOrder(id, body) {
  const db = getDb();
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(num(id));
  if (!o) throw notFound('订单不存在');
  const sets = [];
  const params = [];
  if (body.status !== undefined) {
    if (!ORDER_STATUS.includes(body.status)) throw bad(`状态必须是：${ORDER_STATUS.join(' / ')}`);
    sets.push('status = ?'); params.push(body.status);
  }
  if (body.payment_status !== undefined) {
    if (!['未收款', '部分收款', '已收齐'].includes(body.payment_status)) throw bad('收款状态不合法');
    sets.push('payment_status = ?'); params.push(body.payment_status);
    sets.push('deposit_paid = ?');
    params.push(body.payment_status === '已收齐' ? o.amount_usd : body.payment_status === '未收款' ? 0 : (body.deposit_paid !== undefined ? num(body.deposit_paid) : Math.round(o.amount_usd * 0.3)));
  } else if (body.deposit_paid !== undefined) {
    sets.push('deposit_paid = ?'); params.push(num(body.deposit_paid));
  }
  for (const f of ['etd', 'eta', 'amount_usd']) {
    if (body[f] !== undefined) { sets.push(`${f} = ?`); params.push(f === 'amount_usd' ? num(body[f]) : body[f] || null); }
  }
  if (!sets.length) throw bad('没有可更新字段');
  sets.push('updated_at = ?');
  params.push(NOW());
  db.prepare(`UPDATE orders SET ${sets.join(', ')} WHERE id = ?`).run(...params, o.id);
  return { status: 200, body: db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id) };
}

export function tradeSummary() {
  const db = getDb();
  const q = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM((SELECT COALESCE(SUM(i.qty*i.unit_price),0) FROM quotation_items i WHERE i.quotation_id = qt.id)),0) amount FROM quotations qt`).get();
  const pending = db.prepare("SELECT COUNT(*) c FROM quotations WHERE status IN ('待审批','已发出')").get().c;
  const o = db.prepare('SELECT COUNT(*) c, COALESCE(SUM(amount_usd),0) amount, COALESCE(SUM(deposit_paid),0) paid FROM orders').get();
  const open = db.prepare("SELECT COUNT(*) c, COALESCE(SUM(amount_usd),0) amount FROM orders WHERE status NOT IN ('已签收','已取消')").get();
  const due = db.prepare("SELECT COUNT(*) c FROM orders WHERE status NOT IN ('已签收','已取消') AND etd IS NOT NULL AND etd <= date('now','+14 day')").get().c;
  return { status: 200, body: { quotations: { count: q.c, amount: Math.round(q.amount), pending }, orders: { count: o.c, amount: Math.round(o.amount), paid: Math.round(o.paid), open: open.c, openAmount: Math.round(open.amount), dueSoon: due } } };
}

// ---------- 邮件模板 ----------
export function listTemplates() {
  return { status: 200, body: { items: getDb().prepare('SELECT * FROM templates ORDER BY id').all() } };
}

export function createTemplate(body) {
  const db = getDb();
  const r = db.prepare('INSERT INTO templates (name, category, subject, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(require_(body.name, '模板名称'), body.category ?? '开发信', require_(body.subject, '主题'), String(body.body ?? ''), NOW());
  return { status: 201, body: { id: Number(r.lastInsertRowid) } };
}

// 模板变量渲染
export function renderTemplate(id, vars = {}) {
  const db = getDb();
  const t = db.prepare('SELECT * FROM templates WHERE id = ?').get(num(id));
  if (!t) throw notFound('模板不存在');
  const fill = (s) => String(s).replace(/\{\{(\w+)\}\}/g, (m, k) => (vars[k] ?? `{{${k}}}`));
  return { status: 200, body: { ...t, subject: fill(t.subject), body: fill(t.body) } };
}

export function verifyLogin(email) {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email ?? ''));
  if (!user) return { status: 401, body: { error: '邮箱未注册' } };
  return { status: 200, body: { token: `demo-${user.id}`, user } };
}

export function dispatch(route, method, q, body) {
  const [seg1, seg2, seg3] = route;
  const m = method.toUpperCase();

  if (seg1 === 'stats' && !seg2) return { status: 200, body: stats() };
  if (seg1 === 'users' && !seg2) return listUsers();
  if (seg1 === 'options' && !seg2) return customerOptions();
  if (seg1 === 'ping') return { status: 200, body: { ok: true, at: NOW() } };
  if (seg1 === 'login' && m === 'POST') return verifyLogin(body.email);

  if (seg1 === 'customers') {
    if (!seg2 && m === 'GET') return { status: 200, body: listCustomers(q) };
    if (!seg2 && m === 'POST') return createCustomer(body);
    if (seg2 && seg2 !== 'export') {
      const id = seg2;
      if (!seg3 && m === 'GET') return { status: 200, body: customerDetail(id) };
      if (!seg3 && m === 'PUT') return updateCustomer(id, body);
      if (!seg3 && m === 'DELETE') return deleteCustomer(id);
      if (seg3 === 'contacts' && m === 'POST') return addContact(id, body);
      if (seg3 === 'contact' && m === 'DELETE') return deleteContact(id, q.contact_id);
      if (seg3 === 'followups' && m === 'POST') return addFollowup(id, body);
      if (seg3 === 'followup' && m === 'DELETE') return deleteFollowup(q.followup_id);
      if (seg3 === 'release' && m === 'POST') return releaseToSea(id, body);
      if (seg3 === 'claim' && m === 'POST') return claimCustomer(id, body);
      if (seg3 === 'protect' && m === 'POST') return renewProtection(id, body);
      if (seg3 === 'transfer' && m === 'POST') return transferCustomer(id, body);
    }
  }

  if (seg1 === 'customs') {
    if (!seg2 && m === 'GET') return listCustoms(q);
    if (seg2 === 'analysis' && m === 'GET') return customsAnalysis(q);
    if (seg2 === 'convert' && m === 'POST') return convertImporter(body);
  }

  if (seg1 === 'opportunities') {
    if (!seg2 && m === 'GET') return listOpportunities(q);
    if (!seg2 && m === 'POST') return createOpportunity(body);
    if (seg2 && m === 'PUT') return updateOpportunity(seg2, body);
  }

  if (seg1 === 'activities') {
    if (!seg2 && m === 'GET') return listActivities();
    if (!seg2 && m === 'POST') return createActivity(body);
    if (seg2 && !seg3 && m === 'GET') return activityDetail(seg2);
    if (seg2 && seg3 === 'targets' && m === 'POST') return addActivityTargets(seg2, body.customer_ids ?? []);
    if (seg2 && seg3 === 'advance' && m === 'POST') return advanceActivity(seg2);
  }

  if (seg1 === 'templates') {
    if (!seg2 && m === 'GET') return listTemplates();
    if (!seg2 && m === 'POST') return createTemplate(body);
    if (seg2 && seg3 === 'render' && m === 'POST') return renderTemplate(seg2, body.vars ?? {});
  }

  if (seg1 === 'handovers') {
    if (!seg2 && m === 'GET') return listHandovers(q);
    if (seg2 && seg3 === 'accept' && m === 'POST') return acceptHandover(seg2);
  }

  if (seg1 === 'quotations') {
    if (!seg2 && m === 'GET') return listQuotations(q);
    if (!seg2 && m === 'POST') return createQuotation(body);
    if (seg2 && !seg3 && m === 'GET') return quotationDetail(seg2);
    if (seg2 && seg3 === 'status' && m === 'POST') return updateQuotationStatus(seg2, body);
    if (seg2 && seg3 === 'convert' && m === 'POST') return convertQuotation(seg2, body);
  }

  if (seg1 === 'orders') {
    if (!seg2 && m === 'GET') return listOrders(q);
    if (!seg2 && m === 'POST') return createOrder(body);
    if (seg2 && m === 'PUT') return updateOrder(seg2, body);
  }

  if (seg1 === 'trade' && seg2 === 'summary' && m === 'GET') return tradeSummary();

  throw new ApiError(404, `未知接口：${m} /${route.join('/')}`);
}

export { ApiError };
