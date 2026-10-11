// GET /api/products — পাবলিক এন্ডপয়েন্ট, দোকানের পণ্য ও ক্যাটাগরি ফেরত দেয়
// মার্কেটপ্লেস: শুধু দৃশ্যমান সেলারের সক্রিয় পণ্য (সাসপেন্ড/ব্লক/মুছে-ফেলা/ট্রায়াল-শেষ সেলারের পণ্য লুকানো); প্রতিটি পণ্যে store/store_slug;
// সাথে `sellers` তালিকা ("Shop by Seller", পণ্যের পাতার সেলার-বক্স) — লোগো, গড় রেটিং, পণ্য সংখ্যা। stock/seller_id কখনো প্রকাশ হয় না।
import { json, err } from '../_lib/utils.js';
import { loadVisibleSellers, loadSellerRatings, shapeProduct, queryActiveProducts } from '../_lib/public-products.js';

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const catRes = await env.DB.prepare(
      'SELECT id, name, name_en, e, img FROM categories ORDER BY sort_order ASC, rowid ASC'
    ).all();
    const rows = await queryActiveProducts(env);
    const visible = await loadVisibleSellers(env);

    const categories = (catRes.results || []).map((c) => {
      const o = { ...c };
      Object.keys(o).forEach((k) => o[k] === null && delete o[k]);
      return o;
    });

    const counts = new Map();
    const products = [];
    for (const p of rows) {
      let seller = null;
      if (visible && p.seller_id) {
        seller = visible.get(p.seller_id);
        if (!seller) continue;                      // সাসপেন্ড/ব্লক/মুছে ফেলা/মেয়াদ-শেষ সেলারের পণ্য লুকানো
        counts.set(seller.id, (counts.get(seller.id) || 0) + 1);
      }
      products.push(shapeProduct(p, seller));
    }

    let sellers = [];
    if (visible && counts.size) {
      const ratings = await loadSellerRatings(env);
      sellers = [...counts.entries()].map(([id, count]) => {
        const s = visible.get(id), r = ratings.get(id);
        return { slug: s.slug, name: s.store_name, logo: s.logo || undefined, count, rating: r ? r.avg : undefined, rating_count: r ? r.count : undefined, official: s.is_system ? 1 : undefined };
      }).sort((a, b) => (b.official || 0) - (a.official || 0) || b.count - a.count || a.name.localeCompare(b.name));
      sellers.forEach((s) => Object.keys(s).forEach((k) => s[k] === undefined && delete s[k]));
    }
    return json({ categories, products, sellers });
  } catch (e) {
    return err('ডেটাবেজ থেকে পণ্য লোড করা যায়নি: ' + e.message, 500);
  }
}
