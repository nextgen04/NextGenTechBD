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
