-- মাইগ্রেশন: ফ্ল্যাশ সেল হেডারে কাস্টম ব্যানার ছবি আপলোড করার সুবিধা যোগ করা
--
-- ⚠️ কখন চালাবেন: শুধু তখনই, যদি আপনি এই আপডেটের আগে সাইট চালু করে রেখেছেন।
-- নতুন করে সাইট বসাচ্ছেন? এই ফাইলটা লাগবে না — schema.sql-এই এখন সবকিছু আছে।
--
-- চালানোর নিয়ম:
--   npx wrangler d1 execute nextgentechbd-db --remote --file=./migrations/005_add_flash_banner_img.sql
-- অথবা Cloudflare ড্যাশবোর্ড → D1 → আপনার ডাটাবেজ → Console ট্যাবে পুরো ফাইলটা কপি-পেস্ট করে Run করুন

INSERT OR IGNORE INTO site_text (key, value) VALUES ('flash_banner_img', '');
