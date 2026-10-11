// GET /api/store/:slug — পাবলিক সেলার স্টোর পেজের ডেটা: স্টোরের তথ্য, রেটিং, সক্রিয় পণ্য
// সাসপেন্ড/ব্লক/মুছে-ফেলা/মেয়াদ-শেষ সেলারের স্টোর 404 (অস্তিত্বই প্রকাশ পায় না)। ইমেইল/ফোন/ঠিকানা/username কখনো নয়।
import { json, err } from '../../_lib/utils.js';
import { loadVisibleSellers, loadSellerRatings, shapeProduct, queryActiveProducts } from '../../_lib/public-products.js';

export async function onRequestGet({ env, params }) {
  const slug = String(params.slug || '').toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(slug)) return err('স্টোর পাওয়া যায়নি', 404);
  try {
    const visible = await loadVisibleSellers(env);
    let seller = null;
    if (visible) for (const s of visible.values()) if (s.slug.toLowerCase() === slug) { seller = s; break; }
    if (!seller) return err('স্টোর পাওয়া যায়নি', 404);

    const rows = await queryActiveProducts(env, { sellerId: seller.id });
    const products = rows.map((p) => shapeProduct(p, seller));
    const rating = (await loadSellerRatings(env)).get(seller.id);
    const used = new Set(products.map((p) => p.cat));
    const catRes = await env.DB.prepare('SELECT id, name, name_en, e FROM categories ORDER BY sort_order ASC, rowid ASC').all();
    const categories = (catRes.results || []).filter((c) => used.has(c.id)).map((c) => { const o = { ...c }; Object.keys(o).forEach((k) => o[k] === null && delete o[k]); return o; });

    return json({
      store: { slug: seller.slug, name: seller.store_name, logo: seller.logo || null, description: seller.description || null, since: seller.created_at || null,
        rating: rating ? rating.avg : null, rating_count: rating ? rating.count : 0, product_count: products.length, official: !!seller.is_system },
      categories, products,
    });
  } catch (e) {
    return err('স্টোর লোড করা যায়নি: ' + e.message, 500);
  }
}
