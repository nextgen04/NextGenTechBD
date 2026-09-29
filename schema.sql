-- NextGenTechBD — Cloudflare D1 স্কিমা (সম্পূর্ণ, সব ফিচারসহ)
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
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  cat          TEXT NOT NULL,
  name         TEXT NOT NULL,
  name_en      TEXT,
  price        INTEGER NOT NULL,
  old          INTEGER,
  e            TEXT,
  img          TEXT,
  r            REAL,
  rv           INTEGER,
  sold         INTEGER,
  tag          TEXT,
  f            INTEGER DEFAULT 0,
  colors       TEXT,
  sizes        TEXT,
  sku          TEXT,
  stock        INTEGER,
  low_stock_at INTEGER DEFAULT 5,
  created_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  id                       INTEGER PRIMARY KEY CHECK (id = 1),
  phone                    TEXT,
  whatsapp                 TEXT,
  telegram                 TEXT,
  facebook                 TEXT,
  email                    TEXT,
  bkash                    TEXT,
  nagad                    TEXT,
  rocket                   TEXT,
  cod                      INTEGER DEFAULT 1,
  shop_name                TEXT DEFAULT 'NextGenTechBD',
  address                  TEXT,
  currency                 TEXT DEFAULT '৳',
  invoice_prefix           TEXT DEFAULT 'INV',
  delivery_charge_dhaka    INTEGER DEFAULT 60,
  delivery_charge_outside  INTEGER DEFAULT 120,
  free_delivery_threshold  INTEGER DEFAULT 1999,
  courier_services         TEXT,
  maintenance_mode         INTEGER DEFAULT 0
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
  courier       TEXT,
  tracking_id   TEXT,
  payment_status TEXT DEFAULT 'unpaid',
  coupon_code   TEXT,
  discount      INTEGER DEFAULT 0,
  invoice_no    TEXT,
  seen          INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL,
  status     TEXT NOT NULL,
  note       TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- ================= গ্রাহক লগইন সিস্টেম =================
CREATE TABLE IF NOT EXISTS customers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  phone         TEXT UNIQUE NOT NULL,
  email         TEXT,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  blocked       INTEGER DEFAULT 0,
  notes         TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customer_sessions (
  token         TEXT PRIMARY KEY,
  customer_id   INTEGER NOT NULL,
  created_at    TEXT DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- হোমপেজের সম্পাদনাযোগ্য টেক্সট
CREATE TABLE IF NOT EXISTS site_text (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO site_text (key, value) VALUES ('flash_sale_title', '⚡ ফ্ল্যাশ সেল');
INSERT OR IGNORE INTO site_text (key, value) VALUES ('categories_title', '🗂️ ক্যাটাগরি সমূহ');
INSERT OR IGNORE INTO site_text (key, value) VALUES ('just_for_you_title', '🎯 আপনার জন্য বাছাই করা');

-- ================= ইনভেন্টরি/স্টক হিস্টোরি =================
CREATE TABLE IF NOT EXISTS stock_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  change     INTEGER NOT NULL,
  reason     TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- ================= কুপন ও অফার =================
CREATE TABLE IF NOT EXISTS coupons (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  code             TEXT UNIQUE NOT NULL,
  type             TEXT NOT NULL,          -- 'percent' | 'fixed'
  value            REAL NOT NULL,
  min_purchase     INTEGER DEFAULT 0,
  cat              TEXT,
  product_id       INTEGER,
  start_date       TEXT,
  end_date         TEXT,
  usage_limit      INTEGER,
  used_count       INTEGER DEFAULT 0,
  first_order_only INTEGER DEFAULT 0,
  free_shipping    INTEGER DEFAULT 0,
  active           INTEGER DEFAULT 1,
  created_at       TEXT DEFAULT (datetime('now'))
);

-- ================= ব্যানার/স্লাইডার =================
CREATE TABLE IF NOT EXISTS banners (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT,
  subtitle    TEXT,
  img         TEXT,
  button_text TEXT,
  button_url  TEXT,
  position    TEXT DEFAULT 'hero',
  start_date  TEXT,
  end_date    TEXT,
  active      INTEGER DEFAULT 1,
  sort_order  INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- ================= রিভিউ ও রেটিং =================
CREATE TABLE IF NOT EXISTS reviews (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id    INTEGER NOT NULL,
  customer_name TEXT NOT NULL,
  rating        INTEGER NOT NULL,
  comment       TEXT,
  status        TEXT DEFAULT 'pending',
  featured      INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- ================= অ্যাডমিন লগইন লগ (নিরাপত্তা) =================
CREATE TABLE IF NOT EXISTS admin_login_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  success    INTEGER NOT NULL,
  ip         TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_cat ON products(cat);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);
CREATE INDEX IF NOT EXISTS idx_orders_seen ON orders(seen);
CREATE INDEX IF NOT EXISTS idx_sessions_customer ON customer_sessions(customer_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON customer_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_status_history_order ON order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_stock_history_product ON stock_history(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_banners_active ON banners(active);
CREATE INDEX IF NOT EXISTS idx_login_log_created ON admin_login_log(created_at);

-- ================= পাসওয়ার্ড রিসেট + অ্যাডমিন সেশন (migrations/007 এর কপি) =================
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash  TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,          -- 'customer' অথবা 'admin'
  customer_id INTEGER,                -- অ্যাডমিন টোকেনের ক্ষেত্রে NULL
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pr_customer ON password_resets(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pr_kind ON password_resets(kind, created_at);

-- রিসেটের পর অ্যাডমিনের নতুন পাসওয়ার্ড (হ্যাশ করা) এখানে থাকে; এই রো থাকলে ADMIN_KEY env আর কাজ করে না
CREATE TABLE IF NOT EXISTS admin_credentials (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  updated_at    TEXT
);

-- অ্যাডমিন লগইন সেশন (আসল কী আর ব্রাউজারে থাকে না, শুধু মেয়াদি টোকেন থাকে)
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL,
  ip         TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_exp ON admin_sessions(expires_at);

-- ইমেইল দিয়ে কাস্টমার খোঁজার জন্য
CREATE INDEX IF NOT EXISTS idx_customers_email_lower ON customers(lower(email));

-- ================= rate limiting (migrations/008 এর কপি) =================
CREATE TABLE IF NOT EXISTS rate_limits (
  k   TEXT NOT NULL,      -- যেমন "login:1.2.3.4"
  w   INTEGER NOT NULL,   -- সময়ের জানালা নম্বর
  n   INTEGER NOT NULL,   -- এই জানালায় কতবার
  exp INTEGER NOT NULL,   -- জানালা শেষের সময় (unix সেকেন্ড) — পুরনো রো মুছতে লাগে
  PRIMARY KEY (k, w)
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_exp ON rate_limits(exp);
