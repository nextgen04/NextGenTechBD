-- মাইগ্রেশন: হিরো ব্যানারের ৪টা স্লাইড ও ২টা প্রোমো কার্ড এডিট করার সুবিধা যোগ করা
--
-- ⚠️ কখন চালাবেন: শুধু তখনই, যদি আপনি এই আপডেটের আগে schema.sql/003 মাইগ্রেশন চালিয়ে সাইট চালু করে রেখেছেন।
-- নতুন করে সাইট বসাচ্ছেন? এই ফাইলটা লাগবে না — schema.sql-এই এখন সবকিছু আছে।
--
-- চালানোর নিয়ম:
--   npx wrangler d1 execute nextgentechbd-db --remote --file=./migrations/004_add_hero_promo_text.sql
-- অথবা Cloudflare ড্যাশবোর্ড → D1 → আপনার ডাটাবেজ → Console ট্যাবে পুরো ফাইলটা কপি-পেস্ট করে Run করুন

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
INSERT OR IGNORE INTO site_text (key, value) VALUES ('promo1_h', 'হোম ও লিভিং');
INSERT OR IGNORE INTO site_text (key, value) VALUES ('promo1_p', '৪০% পর্যন্ত ছাড়');
INSERT OR IGNORE INTO site_text (key, value) VALUES ('promo2_h', 'বিউটি কেয়ার');
INSERT OR IGNORE INTO site_text (key, value) VALUES ('promo2_p', 'অরিজিনাল প্রোডাক্ট');
