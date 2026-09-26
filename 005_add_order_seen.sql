-- মাইগ্রেশন: অর্ডার নোটিফিকেশনের জন্য "seen" (দেখা হয়েছে কিনা) কলাম যোগ করা
--
-- ⚠️ কখন চালাবেন: শুধু তখনই, যদি আপনি এই আপডেটের আগে schema.sql চালিয়ে থাকেন।
-- নতুন করে সাইট বসাচ্ছেন? এই ফাইলটা লাগবে না — schema.sql-এই এখন সবকিছু আছে।
--
-- চালানোর নিয়ম:
--   npx wrangler d1 execute nextgentechbd-db --remote --file=./migrations/005_add_order_seen.sql

ALTER TABLE orders ADD COLUMN seen INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_orders_seen ON orders(seen);

-- আগের সব অর্ডার "দেখা হয়েছে" হিসেবে চিহ্নিত করে দেওয়া হচ্ছে, যাতে মাইগ্রেশনের পরপরই
-- পুরনো অর্ডারগুলোর জন্য মিথ্যা নোটিফিকেশন না আসে (শুধু নতুন অর্ডারই নোটিফিকেশন হিসেবে দেখাবে)
UPDATE orders SET seen = 1 WHERE seen = 0;
