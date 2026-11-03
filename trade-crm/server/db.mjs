// 数据库：node:sqlite 建表 + 连接。数据文件位于 data/trade-crm.db（可用 DSH_TCRM_DB 覆盖）。
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const DATA_DIR = process.env.DSH_TCRM_DATA ?? join(ROOT, 'data');
export const DB_FILE = process.env.DSH_TCRM_DB ?? join(DATA_DIR, 'trade-crm.db');

export const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '业务员',
  dept TEXT DEFAULT '',
  email TEXT DEFAULT '',
  avatar_hue INTEGER DEFAULT 210
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_en TEXT DEFAULT '',
  country TEXT DEFAULT '',
  region TEXT DEFAULT '',
  industry TEXT DEFAULT '',
  website TEXT DEFAULT '',
  level TEXT NOT NULL DEFAULT 'B',            -- A/B/C/D 客户分级
  source TEXT DEFAULT '自主开发',              -- 线索来源：海关数据/展会/网站询盘/B2B平台/社媒/自主开发
  status TEXT NOT NULL DEFAULT '跟进中',       -- 跟进中/已成交/公海/已流失
  owner_id INTEGER REFERENCES users(id),
  protection_until TEXT,                       -- 客保到期日（客保管理）
  tax_id TEXT DEFAULT '',
  address TEXT DEFAULT '',
  remark TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  last_follow_at TEXT
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  whatsapp TEXT DEFAULT '',
  linkedin TEXT DEFAULT '',
  is_kp INTEGER NOT NULL DEFAULT 0,            -- 是否关键决策人 KP
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customs (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  hs_code TEXT NOT NULL,
  product TEXT NOT NULL,
  importer TEXT NOT NULL,
  importer_country TEXT NOT NULL,
  exporter TEXT DEFAULT '',
  exporter_country TEXT DEFAULT '',
  trade_type TEXT NOT NULL DEFAULT '进口',     -- 进口 / 出口（我方视角）
  teu REAL NOT NULL DEFAULT 0,
  weight_t REAL NOT NULL DEFAULT 0,
  amount_usd REAL NOT NULL DEFAULT 0,
  shipment_date TEXT NOT NULL,
  carrier TEXT DEFAULT '',
  source_country TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS opportunities (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT '初步接触',      -- 初步接触/需求确认/报价中/谈判中/赢单/输单
  amount_usd REAL NOT NULL DEFAULT 0,
  win_rate INTEGER NOT NULL DEFAULT 30,
  expected_close TEXT,
  owner_id INTEGER REFERENCES users(id),
  source TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  stage_changed_at TEXT
);

CREATE TABLE IF NOT EXISTS followups (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  opportunity_id INTEGER REFERENCES opportunities(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT '电话',          -- 电话/邮件/WhatsApp/展会/拜访/其他
  content TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  next_plan TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT '邮件营销',       -- 邮件营销/展会/社媒营销/EDM群发
  status TEXT NOT NULL DEFAULT '进行中',       -- 进行中/已完成/已暂停
  target_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  open_count INTEGER NOT NULL DEFAULT 0,
  reply_count INTEGER NOT NULL DEFAULT 0,
  start_date TEXT,
  end_date TEXT,
  owner_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_targets (
  id INTEGER PRIMARY KEY,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT '待发送',       -- 待发送/已发送/已打开/已回复
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '开发信',     -- 开发信/询盘回复/报价跟进/节日问候
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS handovers (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  from_user_id INTEGER REFERENCES users(id),
  to_user_id INTEGER NOT NULL REFERENCES users(id),
  reason TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT '待接收',       -- 待接收/已接收
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_customers_owner ON customers(owner_id);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customs_customer ON customs(customer_id);
CREATE INDEX IF NOT EXISTS idx_customs_country ON customs(importer_country);
CREATE INDEX IF NOT EXISTS idx_followups_customer ON followups(customer_id);

-- 报价单（对应参考文档「交易管理 · 报价单」）
CREATE TABLE IF NOT EXISTS quotations (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  opportunity_id INTEGER REFERENCES opportunities(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  incoterms TEXT NOT NULL DEFAULT 'FOB',      -- FOB/CIF/EXW/CFR/DDP
  port TEXT DEFAULT '',
  valid_until TEXT,
  status TEXT NOT NULL DEFAULT '草稿',         -- 草稿/待审批/已发出/已接受/已拒绝/已过期
  owner_id INTEGER REFERENCES users(id),
  remark TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS quotation_items (
  id INTEGER PRIMARY KEY,
  quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  hs_code TEXT DEFAULT '',
  product TEXT NOT NULL,
  spec TEXT DEFAULT '',
  qty INTEGER NOT NULL DEFAULT 0,
  unit_price REAL NOT NULL DEFAULT 0
);

-- 订单（对应参考文档「交易管理 · 订单管理 / 可视化跟单」）
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  quotation_id INTEGER REFERENCES quotations(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  amount_usd REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  incoterms TEXT NOT NULL DEFAULT 'FOB',
  status TEXT NOT NULL DEFAULT '生产中',        -- 待生产/生产中/待出运/已出运/已签收/已取消
  payment_status TEXT NOT NULL DEFAULT '未收款', -- 未收款/部分收款/已收齐
  deposit_paid REAL NOT NULL DEFAULT 0,
  etd TEXT,                                    -- 预计离港
  eta TEXT,                                    -- 预计到港
  owner_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_quotations_customer ON quotations(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
`;

let db;

export function getDb() {
  if (db) return db;
  mkdirSync(dirname(DB_FILE), { recursive: true });
  db = new DatabaseSync(DB_FILE);
  db.exec(SCHEMA);
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = undefined;
  }
}

export const NOW = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
