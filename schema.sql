-- NextGenTechBD — Cloudflare D1 স্কিমা
-- চালানোর নিয়ম (DEPLOY-GUIDE.md এ বিস্তারিত আছে):
--   npx wrangler d1 execute nextgentechbd-db --remote --file=./schema.sql
--   npx wrangler d1 execute nextgentechbd-db --remote --file=./seed.sql

CREATE TABLE IF NOT EXISTS categories (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  name_en TEXT,
  e       TEXT,
  img     TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  cat     TEXT NOT NULL,
  name    TEXT NOT NULL,
  name_en TEXT,
  price   INTEGER NOT NULL,
  old     INTEGER,
  e       TEXT,
  img     TEXT,
  r       REAL,
  rv      INTEGER,
  sold    INTEGER,
  tag     TEXT,
  f       INTEGER DEFAULT 0,
  colors  TEXT,
  sizes   TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  id       INTEGER PRIMARY KEY CHECK (id = 1),
  phone    TEXT,
  whatsapp TEXT,
  telegram TEXT,
  facebook TEXT,
  email    TEXT,
  bkash    TEXT,
  nagad    TEXT,
  rocket   TEXT,
  cod      INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no      TEXT UNIQUE NOT NULL,
  customer_id   INTEGER,
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,
  address       TEXT NOT NULL,
  district      TEXT,
  payment       TEXT,
  note          TEXT,
  items         TEXT NOT NULL,
  subtotal      INTEGER NOT NULL,
  delivery_fee  INTEGER DEFAULT 0,
  total         INTEGER NOT NULL,
  status        TEXT DEFAULT 'pending',
  created_at    TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- ================= গ্রাহক লগইন সিস্টেম =================
CREATE TABLE IF NOT EXISTS customers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  phone         TEXT UNIQUE NOT NULL,
  email         TEXT,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customer_sessions (
  token         TEXT PRIMARY KEY,
  customer_id   INTEGER NOT NULL,
  created_at    TEXT DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- হোমপেজের সম্পাদনাযোগ্য টেক্সট (ফ্ল্যাশ সেল/ক্যাটাগরি/আপনার জন্য বাছাই করা — সেকশনের শিরোনাম)
CREATE TABLE IF NOT EXISTS site_text (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO site_text (key, value) VALUES ('flash_sale_title', '⚡ ফ্ল্যাশ সেল');
INSERT OR IGNORE INTO site_text (key, value) VALUES ('categories_title', '🗂️ ক্যাটাগরি সমূহ');
INSERT OR IGNORE INTO site_text (key, value) VALUES ('just_for_you_title', '🎯 আপনার জন্য বাছাই করা');
-- হিরো ব্যানারের ৪টা স্লাইড (উপরের বড় ক্যারোসেল)
INSERT OR IGNORE INTO site_text (key, value) VALUES ('hero1_h', 'মেগা সেল চলছে!');
INSERT OR IGNORE INTO site_text (key, value) VALUES ('hero1_p', '৭০% পর্যন্ত ছাড় — সীমিত সময়ের অফার');
INSERT OR IGNORE INTO site_text (key, value) VALUES ('hero1_cta', 'এখনই কিনুন');
INSERT OR IGNORE INTO site_text (key, value) VALUES ('hero2_h', 'ফ্ল্যাশ সেল প্রতিদিন');
INSERT OR IGNORE INTO site_text (key, value) VALUES ('hero2_p', 'সকাল ১০টায় নতুন ডিল — আগে আসলে আগে পাবেন');
INSERT OR IGNORE INTO site_text (key, value) VALUES ('hero2_cta', 'ফ্ল্যাশ ডিল দেখুন');
INSERT OR IGNORE INTO site_text (key, value) VALUES ('hero3_h', 'ফ্রি ডেলিভারি!');
INSERT OR IGNORE INTO site_text (key, value) VALUES ('hero3_p', '৳১৯৯৯+ অর্ডারে সারাদেশে ফ্রি ডেলিভারি');
INSERT OR IGNORE INTO site_text (key, value) VALUES ('hero3_cta', 'শপিং শুরু করুন');
INSERT OR IGNORE INTO site_text (key, value) VALUES ('hero4_h', 'গ্রোসারি বাজার');
INSERT OR IGNORE INTO site_text (key, value) VALUES ('hero4_p', 'চাল, তেল, মধু, খেজুর — ঘরে বসে বাজার');
INSERT OR IGNORE INTO site_text (key, value) VALUES ('hero4_cta', 'বাজার করুন');
-- হিরোর ডানপাশের দুটো প্রোমো কার্ড
INSERT OR IGNORE INTO site_text (key, value) VALUES ('promo1_h', 'হোম ও লিভিং');
INSERT OR IGNORE INTO site_text (key, value) VALUES ('promo1_p', '৪০% পর্যন্ত ছাড়');
INSERT OR IGNORE INTO site_text (key, value) VALUES ('promo2_h', 'বিউটি কেয়ার');
INSERT OR IGNORE INTO site_text (key, value) VALUES ('promo2_p', 'অরিজিনাল প্রোডাক্ট');
-- ফ্ল্যাশ সেল হেডারের কাস্টম ব্যানার ছবি (খালি থাকলে ডিফল্ট রঙিন গ্রেডিয়েন্ট দেখায়)
INSERT OR IGNORE INTO site_text (key, value) VALUES ('flash_banner_img', '');

CREATE INDEX IF NOT EXISTS idx_products_cat ON products(cat);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);
CREATE INDEX IF NOT EXISTS idx_sessions_customer ON customer_sessions(customer_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON customer_sessions(expires_at);
