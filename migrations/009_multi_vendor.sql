-- মাইগ্রেশন ০০৯: Multi-Vendor Marketplace (Seller সিস্টেম)
-- ✅ শুধু নতুন টেবিল/কলাম/ইনডেক্স যোগ করে — কোনো পুরোনো ডেটা মোছে না বা বদলায় না।
-- ✅ পুরোনো সব পণ্যের seller_id = NULL থাকে, মানে সেগুলো "প্ল্যাটফর্ম (Super Admin)"-এর নিজের পণ্য হিসেবেই চলতে থাকে।
-- ⚠️ ALTER TABLE ... ADD COLUMN দুইবার চালালে এরর দেয় — তাই এই ফাইল শুধু একবারই চালান।
-- চালানোর নিয়ম (আগে ব্যাকআপ নিন — DEPLOY-GUIDE.md এর "মাল্টি-ভেন্ডর" অংশ দেখুন):
--   npx wrangler d1 execute nextgentechbd-db --remote --file=./migrations/009_multi_vendor.sql

CREATE TABLE IF NOT EXISTS sellers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_name     TEXT NOT NULL,
  owner_name    TEXT,
  email         TEXT NOT NULL,
  phone         TEXT,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',      -- 'active' | 'suspended'
  -- Super Admin যে পারমিশন দেন (০ = বন্ধ, ১ = চালু); ডিফল্ট সব বন্ধ
  can_product_create INTEGER NOT NULL DEFAULT 0,
  can_product_edit   INTEGER NOT NULL DEFAULT 0,
  can_product_delete INTEGER NOT NULL DEFAULT 0,
  can_order_manage   INTEGER NOT NULL DEFAULT 0,
  can_stock_manage   INTEGER NOT NULL DEFAULT 0,
  can_sales_report   INTEGER NOT NULL DEFAULT 0,
  notes         TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sellers_email ON sellers(lower(email));

-- Seller লগইন সেশন (DB-তে টোকেনের শুধু SHA-256 হ্যাশ থাকে)
CREATE TABLE IF NOT EXISTS seller_sessions (
  token_hash TEXT PRIMARY KEY,
  seller_id  INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  ip         TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (seller_id) REFERENCES sellers(id)
);
CREATE INDEX IF NOT EXISTS idx_seller_sessions_seller ON seller_sessions(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_sessions_exp ON seller_sessions(expires_at);

-- পণ্যের মালিক (NULL = প্ল্যাটফর্ম/Super Admin-এর নিজের পণ্য — পুরোনো সব পণ্য এভাবেই থাকে)
ALTER TABLE products ADD COLUMN seller_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_id);

-- একটি অর্ডারে একাধিক Seller-এর পণ্য থাকতে পারে — প্রতিটি লাইন কোন Seller-এর তা এখানে থাকে।
-- (পুরোনো অর্ডারে এই টেবিলে কিছু নেই; সেগুলো আগের মতোই শুধু Super Admin দেখেন।)
CREATE TABLE IF NOT EXISTS order_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL,
  product_id  INTEGER,
  seller_id   INTEGER,                 -- NULL = প্ল্যাটফর্মের নিজের পণ্য
  name        TEXT NOT NULL,
  price       INTEGER NOT NULL,        -- অর্ডারের সময়ের একক মূল্য
  qty         INTEGER NOT NULL,
  line_total  INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',   -- এই Seller-এর অংশের অবস্থা
  courier     TEXT,
  tracking_id TEXT,
  restocked   INTEGER NOT NULL DEFAULT 0,   -- বাতিল/রিটার্নে স্টক ফেরত দেওয়া হয়েছে কি না
  created_at  TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_seller ON order_items(seller_id, created_at);
