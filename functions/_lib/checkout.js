// মাল্টি-সেলার চেকআউটের সার্ভার-সাইড হিসাব: ব্রাউজার শুধু { id, qty } পাঠায় — দাম, সেলার, স্টক ও দৃশ্যমানতা সার্ভার DB থেকে বের করে।
import { getMarketplaceSettings, computeSubscription } from './subscription.js';

export const MAX_LINES = 50;
export const MAX_QTY = 100;
const fail = (error, status, code, extra = {}) => ({ error, status, code, ...extra });

// rawLines → [{ product, qty, seller }]  অথবা { error, status, code }
export async function resolveLines(env, rawLines, { checkStock = true } = {}) {
  if (!Array.isArray(rawLines) || !rawLines.length) return fail('কার্ট খালি', 400, 'EMPTY_CART');
  if (rawLines.length > MAX_LINES) return fail(`একবারে সর্বোচ্চ ${MAX_LINES}টি আলাদা পণ্য অর্ডার করা যায়`, 400, 'TOO_MANY_LINES');
  const merged = new Map();
  for (const l of rawLines) {
    const id = Number(l && l.id), qty = Number(l && l.qty);
    if (!Number.isInteger(id) || id < 1 || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return fail(`পণ্যের সংখ্যা ১ থেকে ${MAX_QTY} এর মধ্যে পূর্ণসংখ্যা হতে হবে`, 400, 'BAD_QTY');
    merged.set(id, Math.min((merged.get(id) || 0) + qty, MAX_QTY));
  }
  const ids = [...merged.keys()];
  const res = await env.DB.prepare(
    `SELECT p.id, p.name, p.name_en, p.price, p.e, p.sku, p.stock, p.status, p.seller_id,
            s.id AS sid, s.store_name, s.status AS seller_status, s.deleted_at AS seller_deleted, s.is_system, s.commission_percent,
            s.trial_ends_at, s.subscription_ends_at, s.access_override
     FROM products p LEFT JOIN sellers s ON s.id = p.seller_id WHERE p.id IN (${ids.map(() => '?').join(',')})`
  ).bind(...ids).all();
  const byId = new Map((res.results || []).map((r) => [r.id, r]));
  const settings = await getMarketplaceSettings(env);
  const official = await env.DB.prepare("SELECT id, store_name FROM sellers WHERE seller_code = 'SYS-OFFICIAL'").first();

  const lines = [];
  for (const [id, qty] of merged) {
    const p = byId.get(id);
    if (!p) return fail('কার্টের একটি পণ্য আর পাওয়া যাচ্ছে না — কার্ট থেকে সরিয়ে আবার চেষ্টা করুন', 409, 'ITEM_UNAVAILABLE', { product_id: id });
    const name = p.name;
    if (p.status && p.status !== 'active') return fail(`"${name}" এখন বিক্রির জন্য উপলব্ধ নয়`, 409, 'ITEM_UNAVAILABLE', { product_id: id });
    // সেলারহীন পুরনো পণ্য (মাইগ্রেশনের আগের ডেটা) = Official সেলারের
    const seller = p.sid
      ? { id: p.sid, store_name: p.store_name, status: p.seller_status, deleted_at: p.seller_deleted, is_system: p.is_system, commission_percent: p.commission_percent,
          trial_ends_at: p.trial_ends_at, subscription_ends_at: p.subscription_ends_at, access_override: p.access_override }
      : (official ? { id: official.id, store_name: official.store_name, status: 'active', is_system: 1, commission_percent: 0 } : null);
    if (!seller) return fail(`"${name}" এর সেলার পাওয়া যায়নি`, 409, 'ITEM_UNAVAILABLE', { product_id: id });
    if (seller.deleted_at || seller.status !== 'active' || !computeSubscription(seller, settings).is_visible) {
      return fail(`"${name}" এখন বিক্রির জন্য উপলব্ধ নয় (সেলারের স্টোর সাময়িক বন্ধ)`, 409, 'ITEM_UNAVAILABLE', { product_id: id });
    }
    if (checkStock && p.stock !== null && p.stock !== undefined && p.stock < qty) {
      return fail(p.stock <= 0 ? `"${name}" স্টকে নেই` : `"${name}" এর স্টকে মাত্র ${p.stock}টি আছে`, 409, 'OUT_OF_STOCK', { product_id: id, available: Math.max(0, p.stock) });
    }
    const pct = Number(seller.commission_percent) > 0 ? Number(seller.commission_percent) : Number(settings.default_commission_percent) || 0;
    lines.push({ product: { id: p.id, name: p.name, name_en: p.name_en, price: p.price, e: p.e, sku: p.sku, stock: p.stock }, qty, seller: { id: seller.id, store_name: seller.store_name }, commission_percent: pct });
  }
  return { lines };
}

export function sellerSubtotalsOf(lines) {
  const out = {};
  for (const l of lines) out[l.seller.id] = (out[l.seller.id] || 0) + l.product.price * l.qty;
  return out;
}
export const subtotalOf = (lines) => lines.reduce((a, l) => a + l.product.price * l.qty, 0);

// ক্লায়েন্টের ckFeeOf()-এর হুবহু নিয়ম: ফ্রি-শিপিং কুপন বা সাবটোটাল ≥ থ্রেশহোল্ড হলে ফ্রি; নইলে ঢাকা/বাইরে
export async function deliveryFee(env, { subtotal, district, freeShipping }) {
  let row = null;
  try { row = await env.DB.prepare('SELECT delivery_charge_dhaka, delivery_charge_outside, free_delivery_threshold FROM settings WHERE id = 1').first(); } catch (e) { /* পুরনো স্কিমা */ }
  const dhaka = row && row.delivery_charge_dhaka != null ? row.delivery_charge_dhaka : 60;
  const outside = row && row.delivery_charge_outside != null ? row.delivery_charge_outside : 120;
  const threshold = row && row.free_delivery_threshold != null ? row.free_delivery_threshold : 1999;
  if (freeShipping || subtotal >= threshold) return 0;
  return district === 'ঢাকা' ? dhaka : outside;
}
