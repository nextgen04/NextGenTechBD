-- মাইগ্রেশন ০০৪: বড় অ্যাডমিন প্যানেল আপগ্রেড
-- (অর্ডার হিস্টরি/কুরিয়ার, কাস্টমার ম্যানেজমেন্ট, ইনভেন্টরি/স্টক, কুপন, ব্যানার, রিভিউ, সেটিংস এক্সটেনশন, লগইন লগ)
--
-- ⚠️ কখন চালাবেন: আগে থেকে সাইট চালু থাকলে (schema.sql আগেই একবার চালানো থাকলে) এই ফাইলটা চালান।
-- নতুন করে সাইট বসাচ্ছেন? লাগবে না — schema.sql-এই এখন সবকিছু আছে।
--
-- চালানোর নিয়ম:
--   npx wrangler d1 execute nextgentechbd-db --remote --file=./migrations/004_admin_upgrade.sql

-- ================= অর্ডার এক্সটেনশন =================
ALTER TABLE orders ADD COLUMN courier TEXT;
ALTER TABLE orders ADD COLUMN tracking_id TEXT;
ALTER TABLE orders ADD COLUMN payment_status TEXT DEFAULT 'unpaid';
ALTER TABLE orders ADD COLUMN coupon_code TEXT;
ALTER TABLE orders ADD COLUMN discount INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN invoice_no TEXT;

CREATE TABLE IF NOT EXISTS order_status_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL,
  status     TEXT NOT NULL,
  note       TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- ================= কাস্টমার এক্সটেনশন =================
ALTER TABLE customers ADD COLUMN blocked INTEGER DEFAULT 0;
ALTER TABLE customers ADD COLUMN notes TEXT;

-- ================= পণ্য/ইনভেন্টরি এক্সটেনশন =================
ALTER TABLE products ADD COLUMN sku TEXT;
ALTER TABLE products ADD COLUMN stock INTEGER;
ALTER TABLE products ADD COLUMN low_stock_at INTEGER DEFAULT 5;

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
  cat              TEXT,                   -- নির্দিষ্ট ক্যাটাগরিতে সীমাবদ্ধ (ঐচ্ছিক)
  product_id       INTEGER,                -- নির্দিষ্ট পণ্যে সীমাবদ্ধ (ঐচ্ছিক)
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
  status        TEXT DEFAULT 'pending',  -- pending | approved | rejected
  featured      INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- ================= দোকানের সেটিংস এক্সটেনশন =================
ALTER TABLE settings ADD COLUMN shop_name TEXT DEFAULT 'NextGenTechBD';
ALTER TABLE settings ADD COLUMN address TEXT;
ALTER TABLE settings ADD COLUMN currency TEXT DEFAULT '৳';
ALTER TABLE settings ADD COLUMN invoice_prefix TEXT DEFAULT 'INV';
ALTER TABLE settings ADD COLUMN delivery_charge_dhaka INTEGER DEFAULT 60;
ALTER TABLE settings ADD COLUMN delivery_charge_outside INTEGER DEFAULT 120;
ALTER TABLE settings ADD COLUMN free_delivery_threshold INTEGER DEFAULT 1999;
ALTER TABLE settings ADD COLUMN courier_services TEXT;
ALTER TABLE settings ADD COLUMN maintenance_mode INTEGER DEFAULT 0;

-- ================= অ্যাডমিন লগইন লগ (নিরাপত্তা) =================
CREATE TABLE IF NOT EXISTS admin_login_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  success    INTEGER NOT NULL,
  ip         TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_history_order ON order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_stock_history_product ON stock_history(product_id);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
CREATE INDEX IF NOT EXISTS idx_banners_active ON banners(active);
CREATE INDEX IF NOT EXISTS idx_login_log_created ON admin_login_log(created_at);
