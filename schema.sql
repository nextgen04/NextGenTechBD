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
  seller_id    INTEGER,                        -- মালিক সেলার (sellers.id)
  status       TEXT NOT NULL DEFAULT 'active', -- 'active' | 'inactive' | 'draft'
  updated_at   TEXT,
  description  TEXT,                           -- পণ্যের বিবরণ (সেলার ড্যাশবোর্ড)
  featured     INTEGER NOT NULL DEFAULT 0,
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
  seller_id  INTEGER,
  changed_by TEXT,
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
  seller_id        INTEGER,   -- NULL = গ্লোবাল কুপন, X = সেলার-নির্দিষ্ট
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
  seller_id     INTEGER,
  customer_id   INTEGER,
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

-- ================================================================
-- মাল্টি-সেলার মার্কেটপ্লেস (migrations/007, 008, 009-এর সমান — fresh install-এর জন্য)
-- ================================================================
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



CREATE INDEX IF NOT EXISTS idx_reviews_seller ON reviews(seller_id);




CREATE INDEX IF NOT EXISTS idx_stock_history_seller ON stock_history(seller_id);

-- seller_id NULL = গ্লোবাল কুপন (বিদ্যমান সব কুপন গ্লোবালই থাকবে), seller_id = X = সেলার-নির্দিষ্ট কুপন


-- মাইগ্রেশন ০০৮: মাল্টি-সেলার অর্ডার — order_items টেবিল
--
-- একটি customer order (orders) এর ভেতরে একাধিক সেলারের আইটেম থাকতে পারবে।
-- orders.items (টেক্সট) আগের মতোই থাকে — পুরনো অর্ডার ট্র্যাকিং/ইনভয়েস/অ্যাডমিন ভিউ ভাঙে না।
-- পুরনো অর্ডারের টেক্সট আইটেম থেকে নির্ভরযোগ্যভাবে order_items বানানো যায় না, তাই পুরনো অর্ডারে order_items থাকবে না
-- (সেগুলো শুধু Super Admin দেখতে পাবে; নতুন অর্ডার থেকে order_items তৈরি হবে)।
--
-- এই ফাইল পুরোপুরি repeatable (শুধু IF NOT EXISTS)।
--   npx wrangler d1 execute nextgentechbd-db --remote --file=./migrations/008_add_order_items.sql

CREATE TABLE IF NOT EXISTS order_items (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id              INTEGER NOT NULL,
  seller_id             INTEGER NOT NULL,
  product_id            INTEGER,
  product_name_snapshot TEXT NOT NULL,
  sku_snapshot          TEXT,
  color                 TEXT,
  size                  TEXT,
  price_snapshot        INTEGER NOT NULL,
  quantity              INTEGER NOT NULL CHECK (quantity > 0),
  subtotal              INTEGER NOT NULL,
  seller_status         TEXT NOT NULL DEFAULT 'pending'
                        CHECK (seller_status IN ('pending','processing','confirmed','shipped','delivered','cancelled','returned')),
  courier               TEXT,
  tracking_id           TEXT,
  -- ভবিষ্যৎ কমিশনের জন্য (এখন commission_percent = 0, seller_earning = subtotal)
  commission_percent    REAL NOT NULL DEFAULT 0,
  commission_amount     INTEGER NOT NULL DEFAULT 0,
  seller_earning        INTEGER NOT NULL DEFAULT 0,
  platform_earning      INTEGER NOT NULL DEFAULT 0,
  seller_seen           INTEGER NOT NULL DEFAULT 0,   -- সেলার ড্যাশবোর্ডের নতুন-অর্ডার নোটিফিকেশনের জন্য
  created_at            TEXT DEFAULT (datetime('now')),
  updated_at            TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (order_id)   REFERENCES orders(id),
  FOREIGN KEY (seller_id)  REFERENCES sellers(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);
CREATE INDEX IF NOT EXISTS idx_order_items_order  ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_seller ON order_items(seller_id, created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_status ON order_items(seller_id, seller_status);
CREATE INDEX IF NOT EXISTS idx_order_items_seen   ON order_items(seller_id, seller_seen);

CREATE TABLE IF NOT EXISTS order_item_status_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_item_id INTEGER NOT NULL,
  status        TEXT NOT NULL,
  note          TEXT,
  changed_by    TEXT NOT NULL,      -- 'seller:<id>' | 'super_admin'
  created_at    TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (order_item_id) REFERENCES order_items(id)
);
CREATE INDEX IF NOT EXISTS idx_oi_history_item ON order_item_status_history(order_item_id);

-- মাইগ্রেশন ০০৯: ১৫ দিনের ফ্রি ট্রায়াল + সাবস্ক্রিপশন (সবকিছু Super Admin নিয়ন্ত্রণ করে)
--
-- নিয়ম:
--  • নতুন সেলার তৈরি হলে trial_ends_at = এখন + trial_days (ডিফল্ট ১৫ দিন, Super Admin বদলাতে পারে)।
--  • ট্রায়াল/সাবস্ক্রিপশন শেষ হলে সেলারের পণ্য হোমপেজ থেকে লুকানো হয় (expired_behavior = 'hide_products')
--    এবং সেলার নতুন পণ্য যোগ/এডিট করতে পারে না, কিন্তু লগইন করে অর্ডার দেখা/ডেলিভারি সম্পন্ন করতে পারে।
--  • Super Admin প্ল্যান বানায়, সেলারকে প্ল্যান অ্যাসাইন/এক্সটেন্ড করে, ট্রায়াল বাড়ায়, ম্যানুয়াল ওভাররাইড দেয়।
--  • এখন পেমেন্ট গেটওয়ে নেই — সেলার bKash/Nagad ইত্যাদিতে টাকা দিলে Super Admin পেমেন্ট রেকর্ড করে সাবস্ক্রিপশন চালু করে।
--
-- এই ফাইল পুরোপুরি repeatable।
--   npx wrangler d1 execute nextgentechbd-db --remote --file=./migrations/009_add_subscriptions.sql

CREATE TABLE IF NOT EXISTS subscription_plans (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  price         INTEGER NOT NULL DEFAULT 0,
  duration_days INTEGER NOT NULL CHECK (duration_days > 0),
  product_limit INTEGER,                 -- NULL = আনলিমিটেড
  description   TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

-- সাবস্ক্রিপশন/ট্রায়ালের সম্পূর্ণ ইতিহাস (অডিট)
CREATE TABLE IF NOT EXISTS seller_subscriptions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id      INTEGER NOT NULL,
  plan_id        INTEGER,
  kind           TEXT NOT NULL CHECK (kind IN ('trial','paid','extension','adjustment')),
  amount         INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT,                   -- bkash | nagad | rocket | bank | cash | other
  payment_ref    TEXT,                   -- ট্রানজেকশন আইডি
  starts_at      TEXT NOT NULL,
  ends_at        TEXT NOT NULL,
  note           TEXT,
  created_by     TEXT NOT NULL,          -- 'system' | 'super_admin'
  created_at     TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (seller_id) REFERENCES sellers(id),
  FOREIGN KEY (plan_id)   REFERENCES subscription_plans(id)
);
CREATE INDEX IF NOT EXISTS idx_seller_subs_seller ON seller_subscriptions(seller_id, created_at);

-- মার্কেটপ্লেসের সেটিংস (key/value — নতুন সেটিং যোগ করতে আর ALTER লাগবে না)
CREATE TABLE IF NOT EXISTS marketplace_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO marketplace_settings (key, value) VALUES ('trial_days', '15');
INSERT OR IGNORE INTO marketplace_settings (key, value) VALUES ('subscription_required', '1');        -- 0 = সাবস্ক্রিপশন বাধ্যতামূলক নয়
INSERT OR IGNORE INTO marketplace_settings (key, value) VALUES ('expired_behavior', 'hide_products'); -- hide_products | keep_visible
INSERT OR IGNORE INTO marketplace_settings (key, value) VALUES ('grace_days', '0');
INSERT OR IGNORE INTO marketplace_settings (key, value) VALUES ('default_commission_percent', '0');

-- উদাহরণ প্ল্যান (নিষ্ক্রিয় অবস্থায় — Super Admin দাম ঠিক করে চালু করবেন)
INSERT INTO subscription_plans (name, price, duration_days, product_limit, description, active, sort_order)
SELECT 'মাসিক (Monthly)', 0, 30, NULL, 'দাম ঠিক করে চালু করুন', 0, 1
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans);
INSERT INTO subscription_plans (name, price, duration_days, product_limit, description, active, sort_order)
SELECT 'বার্ষিক (Yearly)', 0, 365, NULL, 'দাম ঠিক করে চালু করুন', 0, 2
WHERE (SELECT COUNT(*) FROM subscription_plans) = 1;

