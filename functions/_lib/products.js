// সেলারের পণ্য: ইনপুট যাচাই + ownership হেল্পার।
// নিয়ম: seller_id কখনো রিকোয়েস্ট বডি থেকে নেওয়া হয় না; r/rv/sold (রেটিং/রিভিউ/বিক্রি) সেলার সেট করতে পারে না (ভুয়া সোশ্যাল প্রুফ ঠেকাতে)।
import { parseListField } from './utils.js';
import { cleanText, validUrl } from './sellers.js';

export const PRODUCT_STATUSES = ['active', 'inactive', 'draft'];
export const PRODUCT_COLS = 'id, cat, name, name_en, price, old, e, img, tag, f, featured, colors, sizes, sku, stock, low_stock_at, status, description, seller_id, r, rv, sold, created_at, updated_at';

const noAngle = (s) => !/[<>]/.test(s);
const toInt = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

export function shapeProduct(p) {
  return { ...p, colors: parseListField(p.colors) || [], sizes: parseListField(p.sizes) || [] };
}

function cleanList(v, label) {
  if (!Array.isArray(v)) return { error: `${label} তালিকা আকারে দিন` };
  if (v.length > 20) return { error: `${label} সর্বোচ্চ ২০টি হতে পারবে` };
  const out = [];
  for (const x of v) {
    const s = cleanText(x, 30);
    if (!s) continue;
    if (!noAngle(s)) return { error: `${label}-এ < বা > চিহ্ন ব্যবহার করা যাবে না` };
    if (!out.includes(s)) out.push(s);
  }
  return { list: out };
}

// partial=true (এডিট) হলে শুধু পাঠানো ফিল্ড যাচাই হয়। ফেরত: { data } অথবা { error }
export async function validateProduct(env, b, { partial = false, currentPrice = null } = {}) {
  const d = {};
  const has = (k) => b[k] !== undefined;

  if (has('name') || !partial) {
    const v = cleanText(b.name, 200);
    if (v.length < 2) return { error: 'পণ্যের নাম কমপক্ষে ২ অক্ষরের হতে হবে' };
    if (!noAngle(v)) return { error: 'নামে < বা > চিহ্ন ব্যবহার করা যাবে না' };
    d.name = v;
  }
  for (const [k, label, max] of [['name_en', 'ইংরেজি নাম', 200], ['sku', 'SKU', 40], ['tag', 'ট্যাগ', 20], ['e', 'ইমোজি', 8], ['description', 'বিবরণ', 3000]]) {
    if (!has(k)) continue;
    const v = cleanText(b[k], max);
    if (!noAngle(v)) return { error: `${label}-এ < বা > চিহ্ন ব্যবহার করা যাবে না` };
    d[k] = v || null;
  }
  if (has('cat') || !partial) {
    const cat = cleanText(b.cat, 40);
    const row = cat ? await env.DB.prepare('SELECT id FROM categories WHERE id = ?').bind(cat).first() : null;
    if (!row) return { error: 'একটি বিদ্যমান ক্যাটাগরি বেছে নিন (সেলার নতুন ক্যাটাগরি তৈরি করতে পারে না)' };
    d.cat = cat;
  }
  if (has('price') || !partial) {
    const p = Number(b.price);
    if (!Number.isInteger(p) || p < 1 || p > 100000000) return { error: 'দাম ১ বা তার বেশি পূর্ণসংখ্যা হতে হবে' };
    d.price = p;
  }
  if (has('old')) {
    const o = toInt(b.old);
    if (o !== null) {
      if (!Number.isInteger(o) || o < 1) return { error: 'পুরনো দাম সঠিক নয়' };
      const price = d.price !== undefined ? d.price : currentPrice;
      if (price !== null && o <= price) return { error: 'পুরনো দাম বর্তমান দামের চেয়ে বেশি হতে হবে' };
    }
    d.old = o;
  }
  if (has('img')) {
    const v = cleanText(b.img, 500);
    if (v && !validUrl(v)) return { error: 'ছবির URL অবশ্যই https:// দিয়ে শুরু হতে হবে' };
    d.img = v || null;
  }
  if (has('stock')) {
    const s = toInt(b.stock);
    if (s !== null && (!Number.isInteger(s) || s < 0 || s > 10000000)) return { error: 'স্টক ০ বা তার বেশি পূর্ণসংখ্যা হতে হবে' };
    d.stock = s;
  }
  if (has('low_stock_at')) {
    const s = toInt(b.low_stock_at);
    if (s === null || !Number.isInteger(s) || s < 0 || s > 100000) return { error: 'লো-স্টক সীমা সঠিক নয়' };
    d.low_stock_at = s;
  }
  for (const k of ['f', 'featured']) if (has(k)) d[k] = b[k] === true || b[k] === 1 || b[k] === '1' || b[k] === 'true' ? 1 : 0;
  if (has('status')) {
    if (!PRODUCT_STATUSES.includes(b.status)) return { error: 'status অবশ্যই active, inactive অথবা draft হতে হবে' };
    d.status = b.status;
  }
  for (const k of ['colors', 'sizes']) {
    if (!has(k)) continue;
    const r = cleanList(b[k], k === 'colors' ? 'কালার' : 'সাইজ');
    if (r.error) return { error: r.error };
    d[k] = r.list.length ? JSON.stringify(r.list) : null;
  }
  return { data: d };
}

// ownership: অন্য সেলারের পণ্য "নেই" এর মতোই আচরণ (404) — অস্তিত্বও ফাঁস হয় না
export async function getOwnedProduct(env, id, sellerId) {
  return env.DB.prepare(`SELECT ${PRODUCT_COLS} FROM products WHERE id = ? AND seller_id = ?`).bind(id, sellerId).first();
}

// সাবস্ক্রিপশন প্ল্যানে product_limit থাকলে (শুধু পেইড অবস্থায়) নতুন পণ্য যোগে সীমা প্রযোজ্য
export async function checkProductLimit(env, seller, subscription) {
  if (subscription.state !== 'active' || !seller.subscription_plan_id) return null;
  const plan = await env.DB.prepare('SELECT name, product_limit FROM subscription_plans WHERE id = ?').bind(seller.subscription_plan_id).first();
  if (!plan || plan.product_limit === null || plan.product_limit === undefined) return null;
  const c = await env.DB.prepare(`SELECT COUNT(*) AS c FROM products WHERE seller_id = ? AND status != 'draft'`).bind(seller.id).first();
  return c.c >= plan.product_limit ? `আপনার প্ল্যানে (${plan.name}) সর্বোচ্চ ${plan.product_limit}টি পণ্য রাখা যায়` : null;
}
