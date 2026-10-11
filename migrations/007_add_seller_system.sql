-- মাইগ্রেশন ০০৭: মাল্টি-সেলার মার্কেটপ্লেস — সেলার, সেশন, লগইন লগ, অ্যাডমিন সেশন, প্রোডাক্ট ownership
--
-- ⚠️ এটি শুধু একবার চালান (ALTER TABLE ... ADD COLUMN SQLite/D1-এ দুইবার চালানো যায় না)।
-- CREATE TABLE / INSERT অংশগুলো repeatable (IF NOT EXISTS / OR IGNORE)।
-- কোনো বিদ্যমান ডেটা মোছা বা বদলানো হয় না — শুধু নতুন কলাম/টেবিল যোগ হয়।
--
--   npx wrangler d1 execute nextgentechbd-db --remote --file=./migrations/007_add_seller_system.sql

-- ================= সেলার =================
CREATE TABLE IF NOT EXISTS sellers (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_code          TEXT UNIQUE NOT NULL,              -- যেমন SLR-000001
  username             TEXT NOT NULL COLLATE NOCASE,      -- লগইন আইডি (ইউনিক, বড়-ছোট হাতের অক্ষর গণ্য হয় না)
  slug                 TEXT NOT NULL COLLATE NOCASE,      -- পাবলিক স্টোর URL: /store/<slug>
  password_hash        TEXT NOT NULL,
  password_salt        TEXT NOT NULL,
  role                 TEXT NOT NULL DEFAULT 'SELLER',    -- ভবিষ্যতে SELLER_STAFF যোগ করা যাবে
  name                 TEXT NOT NULL,
  store_name           TEXT NOT NULL,
  phone                TEXT,
  email                TEXT,
  address              TEXT,
  logo                 TEXT,
  description          TEXT,
  status               TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','blocked')),
  is_system            INTEGER NOT NULL DEFAULT 0,        -- 1 = ডিফল্ট "NextGenTechBD Official" (লগইন করা যায় না)
  -- সাবস্ক্রিপশন / ফ্রি ট্রায়াল (Super Admin নিয়ন্ত্রণ করে)
  trial_ends_at        TEXT,                              -- ISO তারিখ; ফ্রি ট্রায়াল শেষ হওয়ার সময়
  subscription_plan_id INTEGER,
  subscription_ends_at TEXT,                              -- পেইড সাবস্ক্রিপশন শেষ হওয়ার সময়
  access_override      TEXT,                              -- NULL | 'allow' | 'deny' (Super Admin ম্যানুয়াল ওভাররাইড)
  -- ভবিষ্যৎ কমিশন সিস্টেমের জন্য
  commission_percent   REAL NOT NULL DEFAULT 0,
  -- লগইন সিকিউরিটি
  failed_logins        INTEGER NOT NULL DEFAULT 0,
  locked_until         TEXT,
  created_at           TEXT DEFAULT (datetime('now')),
  updated_at           TEXT DEFAULT (datetime('now')),
  last_login_at        TEXT,
  deleted_at           TEXT                               -- soft delete (deactivate)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sellers_username ON sellers(username);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sellers_slug ON sellers(slug);
CREATE INDEX IF NOT EXISTS idx_sellers_status ON sellers(status);

-- সেশন টোকেন কাঁচা অবস্থায় রাখা হয় না — শুধু SHA-256 হ্যাশ (token_hash) থাকে
CREATE TABLE IF NOT EXISTS seller_sessions (
  token_hash  TEXT PRIMARY KEY,
  seller_id   INTEGER NOT NULL,
  created_at  TEXT DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  ip          TEXT,
  user_agent  TEXT,
  FOREIGN KEY (seller_id) REFERENCES sellers(id)
);
CREATE INDEX IF NOT EXISTS idx_seller_sessions_seller ON seller_sessions(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_sessions_expires ON seller_sessions(expires_at);

CREATE TABLE IF NOT EXISTS seller_login_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id  INTEGER,
  username   TEXT,
  success    INTEGER NOT NULL,
  ip         TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_seller_login_log_user ON seller_login_log(username, created_at);
CREATE INDEX IF NOT EXISTS idx_seller_login_log_ip ON seller_login_log(ip, created_at);

-- ================= সুপার অ্যাডমিন সেশন (HttpOnly cookie; X-Admin-Key আগের মতোই কাজ করবে) =================
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash  TEXT PRIMARY KEY,
  created_at  TEXT DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  ip          TEXT,
  user_agent  TEXT
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);

-- ================= ডিফল্ট সিস্টেম সেলার: NextGenTechBD Official =================
-- password_hash/salt = 'DISABLED' — কখনোই কোনো পাসওয়ার্ডের সাথে মিলবে না, তাই এই অ্যাকাউন্টে লগইন অসম্ভব।
-- Super Admin এর মালিকানাধীন সব পুরনো পণ্য এই সেলারের অধীনে যাবে।
INSERT OR IGNORE INTO sellers
  (seller_code, username, slug, password_hash, password_salt, name, store_name, status, is_system)
VALUES
  ('SYS-OFFICIAL', 'nextgentechbd-official', 'nextgentechbd-official', 'DISABLED', 'DISABLED',
   'NextGenTechBD', 'NextGenTechBD Official', 'active', 1);

-- ================= প্রোডাক্ট ownership =================
ALTER TABLE products ADD COLUMN seller_id INTEGER;
ALTER TABLE products ADD COLUMN status TEXT NOT NULL DEFAULT 'active';   -- 'active' | 'inactive' | 'draft'
ALTER TABLE products ADD COLUMN updated_at TEXT;

UPDATE products
   SET seller_id = (SELECT id FROM sellers WHERE seller_code = 'SYS-OFFICIAL')
 WHERE seller_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);

-- ================= প্রোডাক্ট ট্রান্সফার অডিট =================
CREATE TABLE IF NOT EXISTS product_transfers (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id         INTEGER NOT NULL,
  previous_seller_id INTEGER,
  new_seller_id      INTEGER NOT NULL,
  changed_by         TEXT NOT NULL,          -- যেমন 'super_admin'
  note               TEXT,
  changed_at         TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_product_transfers_product ON product_transfers(product_id);

-- ================= রিভিউ / স্টক হিস্টরি / কুপন-এ seller সম্পর্ক =================
ALTER TABLE reviews ADD COLUMN seller_id INTEGER;
ALTER TABLE reviews ADD COLUMN customer_id INTEGER;
UPDATE reviews SET seller_id = (SELECT p.seller_id FROM products p WHERE p.id = reviews.product_id) WHERE seller_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_seller ON reviews(seller_id);

ALTER TABLE stock_history ADD COLUMN seller_id INTEGER;
ALTER TABLE stock_history ADD COLUMN changed_by TEXT;
UPDATE stock_history SET seller_id = (SELECT p.seller_id FROM products p WHERE p.id = stock_history.product_id) WHERE seller_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_stock_history_seller ON stock_history(seller_id);

-- seller_id NULL = গ্লোবাল কুপন (বিদ্যমান সব কুপন গ্লোবালই থাকবে), seller_id = X = সেলার-নির্দিষ্ট কুপন
ALTER TABLE coupons ADD COLUMN seller_id INTEGER;
