// সেলারের পণ্য ইনপুট যাচাই — সেলার কখনো rating (r/rv), sold, seller_id সেট করতে পারে না (জাল সোশ্যাল-প্রুফ ও ownership ঠেকাতে)
import { cleanText, validUrl } from './sellers.js';

export const PRODUCT_STATUSES = ['active', 'inactive', 'draft'];
// নাম/বিবরণে: < > " ` \ নিষিদ্ধ। রং/সাইজ/SKU/ট্যাগ/ইমোজি (যেগুলো স্টোরফ্রন্টে inline onclick-এ যায়) — ' ও নিষিদ্ধ।
const hasAngle = (s) => /[<>"`\\]/.test(s);
const hasUnsafeToken = (s) => /[<>"'`\\]/.test(s);
const toInt = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

export function cleanList(v, maxItems = 20, maxLen = 30) {
  if (!Array.isArray(v)) return { ok: true, value: null };
  const items = v.map((x) => cleanText(x, maxLen)).filter(Boolean).slice(0, maxItems);
  if (items.some(hasUnsafeToken)) return { ok: false };
  return { ok: true, value: items.length ? JSON.stringify(items) : null };
}

// partial=true হলে (PUT) শুধু পাঠানো ফিল্ড যাচাই হয়
export async function validateProduct(env, b, { partial = false } = {}) {
  const out = {};
  const need = (k, label) => (b[k] === undefined || b[k] === null || b[k] === '') && !partial ? `${label} আবশ্যক` : null;

  for (const e of [need('name', 'পণ্যের নাম'), need('cat', 'ক্যাটাগরি'), need('price', 'মূল্য')]) if (e) return { error: e };

  const TOKEN_FIELDS = ['e', 'tag', 'sku'];
  const text = (k, label, max) => {
    if (b[k] === undefined) return null;
    const v = cleanText(b[k], max);
    if ((TOKEN_FIELDS.includes(k) ? hasUnsafeToken(v) : hasAngle(v))) return `${label}-এ < > " ' ` + '`' + ` \\ চিহ্ন ব্যবহার করা যাবে না`;
    out[k] = v || null; return null;
  };
  for (const e of [text('name', 'নাম', 200), text('name_en', 'ইংরেজি নাম', 200), text('e', 'ইমোজি', 8), text('tag', 'ট্যাগ', 40), text('sku', 'SKU', 60)]) if (e) return { error: e };
  if (out.name !== undefined && (!out.name || out.name.length < 2)) return { error: 'পণ্যের নাম কমপক্ষে ২ অক্ষরের হতে হবে' };

  if (b.cat !== undefined) {
    const cat = await env.DB.prepare('SELECT id FROM categories WHERE id = ?').bind(String(b.cat)).first();
    if (!cat) return { error: 'ক্যাটাগরি সঠিক নয় — Super Admin-এর তৈরি করা ক্যাটাগরি থেকেই বেছে নিন' };
    out.cat = cat.id;
  }
  if (b.price !== undefined) {
    const p = Number(b.price);
    if (!Number.isInteger(p) || p < 1 || p > 10000000) return { error: 'মূল্য ১ থেকে ১,০০,০০,০০০ এর মধ্যে পূর্ণসংখ্যা হতে হবে' };
    out.price = p;
  }
  if (b.old !== undefined) {
    const o = toInt(b.old);
    if (o !== null && (!Number.isInteger(o) || o < 1 || o > 10000000)) return { error: 'পুরনো মূল্য সঠিক নয়' };
    out.old = o;
  }
  const priceNow = out.price !== undefined ? out.price : undefined;
  if (out.old && priceNow !== undefined && out.old < priceNow) return { error: 'পুরনো মূল্য বর্তমান মূল্যের চেয়ে কম হতে পারে না' };
  if (b.stock !== undefined) {
    const s = toInt(b.stock);
    if (s !== null && (!Number.isInteger(s) || s < 0 || s > 1000000)) return { error: 'স্টক ০ বা তার বেশি পূর্ণসংখ্যা হতে হবে' };
    out.stock = s;
  }
  if (b.low_stock_at !== undefined) {
    const l = toInt(b.low_stock_at);
    if (l === null || !Number.isInteger(l) || l < 0 || l > 100000) return { error: 'লো-স্টক সীমা সঠিক নয়' };
    out.low_stock_at = l;
  }
  if (b.img !== undefined) {
    const img = cleanText(b.img, 500);
    if (!validUrl(img)) return { error: 'ছবির URL অবশ্যই https:// বা / দিয়ে শুরু হতে হবে' };
    out.img = img || null;
  }
  if (b.f !== undefined) out.f = b.f ? 1 : 0;                 // f = ফ্ল্যাশ সেল
  if (b.featured !== undefined) out.featured = b.featured ? 1 : 0;   // featured = ফিচার্ড পণ্য
  if (b.description !== undefined) {
    const d = String(b.description == null ? '' : b.description).replace(/\r\n/g, '\n').trim().slice(0, 2000);
    if (/[<>`]/.test(d)) return { error: 'বিবরণে < > ` চিহ্ন ব্যবহার করা যাবে না' };
    out.description = d || null;
  }
  if (b.status !== undefined) {
    if (!PRODUCT_STATUSES.includes(b.status)) return { error: 'স্ট্যাটাস সঠিক নয়' };
    out.status = b.status;
  }
  for (const k of ['colors', 'sizes']) {
    if (b[k] === undefined) continue;
    const l = cleanList(b[k]);
    if (!l.ok) return { error: `${k === 'colors' ? 'রং' : 'সাইজ'}-এ < > " ' ` + '`' + ` \\ চিহ্ন ব্যবহার করা যাবে না` };
    out[k] = l.value;
  }
  return { data: out };
}

export const PRODUCT_COLS_BASE = 'id, seller_id, cat, name, name_en, price, old, e, img, r, rv, sold, tag, f, colors, sizes, sku, stock, low_stock_at, status, created_at, updated_at';
export const PRODUCT_COLS = PRODUCT_COLS_BASE + ', description, featured';   // description/featured → মাইগ্রেশন ০১০
export const isMissingColumn = (e) => /no such column|has no column named/i.test(String((e && e.message) || e));
// প্রথমে পূর্ণ কলাম-তালিকা; মাইগ্রেশন ০১০ না চললে বেস তালিকায় নেমে আসে
export async function selectProducts(env, build, args) {
  try { return await env.DB.prepare(build(PRODUCT_COLS)).bind(...args).all(); }
  catch (e) { if (!isMissingColumn(e)) throw e; return env.DB.prepare(build(PRODUCT_COLS_BASE)).bind(...args).all(); }
}
export function outProduct(p) {
  const list = (v) => { try { return v ? JSON.parse(v) : []; } catch (e) { return []; } };
  return { ...p, colors: list(p.colors), sizes: list(p.sizes) };
}
