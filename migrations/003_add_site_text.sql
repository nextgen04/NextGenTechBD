-- মাইগ্রেশন: বিদ্যমান ডেটাবেজে "হোমপেজ টেক্সট এডিটিং" ফিচার যোগ করা
--
-- ⚠️ কখন চালাবেন: শুধু তখনই, যদি আপনি এই আপডেটের আগে schema.sql চালিয়ে সাইট চালু করে রেখেছেন।
-- নতুন করে সাইট বসাচ্ছেন? এই ফাইলটা লাগবে না — schema.sql-এই এখন সবকিছু আছে।
--
-- চালানোর নিয়ম:
--   npx wrangler d1 execute nextgentechbd-db --remote --file=./migrations/003_add_site_text.sql

CREATE TABLE IF NOT EXISTS site_text (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO site_text (key, value) VALUES ('flash_sale_title', '⚡ ফ্ল্যাশ সেল');
INSERT OR IGNORE INTO site_text (key, value) VALUES ('categories_title', '🗂️ ক্যাটাগরি সমূহ');
INSERT OR IGNORE INTO site_text (key, value) VALUES ('just_for_you_title', '🎯 আপনার জন্য বাছাই করা');

-- নোট: পণ্যের ছবি আপলোড ফিচারের জন্য কোনো নতুন টেবিল লাগে না (ছবি D1-তে না, Cloudflare R2-তে জমা হয়) —
-- শুধু Cloudflare Pages প্রজেক্টে একটা R2 বাকেট বাইন্ডিং (নাম: IMAGES) যোগ করতে হবে, বিস্তারিত DEPLOY-GUIDE.md-এ আছে।
