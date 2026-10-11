// পাবলিক দোকানের পণ্য/সেলার দৃশ্যমানতা — হোমপেজ (/api/products) ও স্টোর পেজ (/api/store/:slug) একই নিয়ম ব্যবহার করে।
// নিয়ম: পণ্য status='active' + সেলার active + মুছে ফেলা নয় + ট্রায়াল/সাবস্ক্রিপশনের হিসাবে "দৃশ্যমান" (expired_behavior=hide_products হলে মেয়াদ শেষে লুকায়)।
// সেলারহীন পণ্য (মাইগ্রেশনের আগের ডেটা) আগের মতোই দেখা যায়।
import { parseListField } from './utils.js';
import { getMarketplaceSettings, computeSubscription } from './subscription.js';

export const PUBLIC_PRODUCT_COLS = 'id, cat, name, name_en, price, old, e, img, r, rv, sold, tag, f, colors, sizes, stock, seller_id';
const PUBLIC_EXTRA = ', description, featured';   // মাইগ্রেশন ০১০

// Map<sellerId, seller> — শুধু যাদের পণ্য এখন দোকানে দেখানো যাবে। মাইগ্রেশন ০০৭ না চললে null (= সব পণ্য দেখাও, আগের আচরণ)।
export async function loadVisibleSellers(env) {
  try {
    const res = await env.DB.prepare(
      `SELECT id, slug, store_name, logo, description, is_system, trial_ends_at, subscription_ends_at, access_override, created_at
       FROM sellers WHERE deleted_at IS NULL AND status = 'active'`
    ).all();
    const settings = await getMarketplaceSettings(env);
    const map = new Map();
    for (const s of res.results || []) if (computeSubscription(s, settings).is_visible) map.set(s.id, s);
    return map;
  } catch (e) {
    return null;
  }
}

// Map<sellerId, { avg, count }> — শুধু Super Admin-অনুমোদিত রিভিউ
export async function loadSellerRatings(env) {
  const map = new Map();
  try {
    const res = await env.DB.prepare(
      `SELECT seller_id, ROUND(AVG(rating), 1) AS avg, COUNT(*) AS count FROM reviews WHERE status = 'approved' AND seller_id IS NOT NULL GROUP BY seller_id`
    ).all();
    for (const r of res.results || []) map.set(r.seller_id, { avg: r.avg, count: r.count });
  } catch (e) { /* পুরনো স্কিমা */ }
  return map;
}

// দোকানের ফ্রন্টএন্ডের আগের JSON আকার অপরিবর্তিত; শুধু store/store_slug যোগ। r/rv/sold না থাকলে 0 (সেলারের পণ্যে জাল রেটিং/বিক্রি নেই)।
export function shapeProduct(p, seller) {
  const o = { ...p };
  delete o.seller_id;
  // স্টক সংখ্যা কখনো প্রকাশ হয় না — শুধু "স্টক শেষ" পতাকা (ট্র্যাক করা পণ্যে স্টক ≤ ০); স্টক ট্র্যাক না করলে (NULL) কখনোই শেষ নয়
  if (p.stock !== null && p.stock !== undefined && Number(p.stock) <= 0) o.oos = 1;
  delete o.stock;
  o.f = p.f ? 1 : undefined;
  o.featured = p.featured ? 1 : undefined;
  if (p.description) o.description = String(p.description).slice(0, 2000);
  const colors = parseListField(p.colors);
  const sizes = parseListField(p.sizes);
  delete o.colors; delete o.sizes;
  if (colors) o.colors = colors;
  if (sizes) o.sizes = sizes;
  o.r = Number(p.r) || 0; o.rv = Number(p.rv) || 0; o.sold = Number(p.sold) || 0;
  if (seller) { o.store = seller.store_name; o.store_slug = seller.slug; }
  Object.keys(o).forEach((k) => (o[k] === null || o[k] === undefined) && delete o[k]);
  return o;
}

// ডেটাবেজ থেকে সক্রিয় পণ্য (status কলাম না থাকলে সব)
export async function queryActiveProducts(env, { sellerId = null } = {}) {
  const where = sellerId ? ' AND seller_id = ?' : '';
  const args = sellerId ? [sellerId] : [];
  const noSeller = (c) => c.replace(', seller_id', '');
  // স্তরে স্তরে নামা: পূর্ণ (০১০ সহ) → ০১০ ছাড়া → মাইগ্রেশনের আগের স্কিমা (status/seller_id নেই)
  const attempts = [
    () => env.DB.prepare(`SELECT ${PUBLIC_PRODUCT_COLS}${PUBLIC_EXTRA} FROM products WHERE COALESCE(status, 'active') = 'active'${where} ORDER BY id ASC`).bind(...args).all(),
    () => env.DB.prepare(`SELECT ${PUBLIC_PRODUCT_COLS} FROM products WHERE COALESCE(status, 'active') = 'active'${where} ORDER BY id ASC`).bind(...args).all(),
    () => env.DB.prepare(`SELECT ${noSeller(PUBLIC_PRODUCT_COLS)} FROM products ORDER BY id ASC`).all(),
  ];
  let lastErr;
  for (const run of attempts) { try { return (await run()).results || []; } catch (e) { lastErr = e; } }
  throw lastErr;
}
