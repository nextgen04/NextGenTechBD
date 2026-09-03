-- মাইগ্রেশন: বিদ্যমান ডেটাবেজে "গ্রাহক লগইন সিস্টেম" যোগ করা
--
-- ⚠️ কখন চালাবেন: শুধু তখনই, যদি আপনি আগে (এই আপডেটের আগে) schema.sql চালিয়ে সাইট চালু করে থাকেন
-- এবং এখন নতুন গ্রাহক লগইন/অর্ডার হিস্টোরি ফিচারটা যোগ করতে চান।
--
-- নতুন করে সাইট বসাচ্ছেন (এই zip দিয়ে প্রথমবার ডেটাবেজ বানাচ্ছেন)?
-- তাহলে এই ফাইলটা লাগবে না — schema.sql-এই সবকিছু আগে থেকে আছে।
--
-- চালানোর নিয়ম:
--   npx wrangler d1 execute nextgentechbd-db --remote --file=./migrations/001_add_customer_accounts.sql

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

-- পুরনো orders টেবিলে customer_id কলাম যোগ করা (নতুন অর্ডারগুলো লগইন করা গ্রাহকের সাথে যুক্ত হবে,
-- পুরনো অর্ডারগুলোর জন্য এই কলাম NULL থাকবে — কোনো ডেটা হারাবে না)
ALTER TABLE orders ADD COLUMN customer_id INTEGER REFERENCES customers(id);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);
CREATE INDEX IF NOT EXISTS idx_sessions_customer ON customer_sessions(customer_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON customer_sessions(expires_at);
