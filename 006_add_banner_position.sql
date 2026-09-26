-- হোমপেজের hero slider আর পাশের সাইড ব্যানার কার্ড — দুটোকেই এখন banners টেবিল দিয়ে
-- অ্যাডমিন প্যানেল থেকে নিয়ন্ত্রণ করা যাবে। position='hero' হলে বড় স্লাইডারে দেখাবে,
-- position='side' হলে ডানপাশের ছোট কার্ডে দেখাবে (সর্বোচ্চ ২টা)।
ALTER TABLE banners ADD COLUMN position TEXT DEFAULT 'hero';
