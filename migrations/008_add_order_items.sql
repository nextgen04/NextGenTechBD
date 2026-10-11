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
