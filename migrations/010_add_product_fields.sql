-- মাইগ্রেশন ০১০: সেলার ড্যাশবোর্ডের জন্য পণ্যের অতিরিক্ত ফিল্ড — বিবরণ (description) ও ফিচার্ড (featured)
--
-- ⚠️ শুধু একবার চালান (ALTER TABLE ... ADD COLUMN দুইবার চালানো যায় না)। বিদ্যমান কোনো ডেটা বদলায় না।
--   npx wrangler d1 execute nextgentechbd-db --remote --file=./migrations/010_add_product_fields.sql
ALTER TABLE products ADD COLUMN description TEXT;
ALTER TABLE products ADD COLUMN featured INTEGER NOT NULL DEFAULT 0;
