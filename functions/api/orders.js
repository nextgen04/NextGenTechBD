// POST /api/orders — চেকআউটে অর্ডারটি D1 ডেটাবেজে সংরক্ষণ হয়
// 🔒 দাম, ডেলিভারি ফি, কুপন ছাড় ও মোট — সবকিছু সার্ভারে ডেটাবেজের আসল তথ্য দিয়ে নতুন করে হিসাব হয়।
//    ব্রাউজার শুধু পাঠায়: কাস্টমারের তথ্য + cart:[{id, qty}] + couponCode। পাঠানো দাম/মোট থাকলেও উপেক্ষা করা হয়।
//    রেসপন্সে সার্ভারের হিসাব করা মোট ফেরত যায় — ফ্রন্টএন্ড সেটা দিয়েই হোয়াটসঅ্যাপ মেসেজ বানায়।
// গ্রাহক লগইন করা থাকলে (X-Session-Token) অর্ডারটি তার অ্যাকাউন্টের সাথে যুক্ত হয়।
import { json, err, getCustomerFromRequest } from '../_lib/utils.js';
import { evaluateCoupon, computeDeliveryFee } from '../_lib/pricing.js';
import { rateLimit } from '../_lib/ratelimit.js';

const PHONE_RE = /^01[3-9]\d{8}$/;
const ORDER_NO_RE = /^[A-Za-z]{2}\d{6,12}$/;
const MAX_LINES = 30;
const MAX_QTY = 50;

function genOrderNo() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 100000000;
  return 'SB' + String(n).padStart(8, '0');
}
const str = (v, max) => (v === undefined || v === null ? '' : String(v)).trim().slice(0, max);

export async function onRequestPost(context) {
  const { request, env } = context;
  let claimedCouponId = null;
  const limited = await rateLimit(env, request, 'order', 10, 10 * 60);
  if (limited) return limited;
  try {
    let body;
    try { body = await request.json(); } catch (e) { return err('অনুরোধ সঠিক নয়', 400); }
    body = body || {};

    // ---- কাস্টমারের তথ্য যাচাই ----
    const name = str(body.name, 100);
    const phone = str(body.phone, 20);
    const address = str(body.address, 300);
    const district = str(body.district, 50);
    const payment = str(body.payment, 60);
    const note = str(body.note, 200);
    if (name.length < 3) return err('সঠিক নাম দিন', 400);
    if (!PHONE_RE.test(phone)) return err('সঠিক মোবাইল নম্বর দিন', 400);
    if (address.length < 10) return err('সম্পূর্ণ ঠিকানা দিন', 400);

    // ---- কার্ট যাচাই (শুধু id ও qty নেওয়া হয়; একই পণ্য দুবার থাকলে যোগ করা হয়) ----
    if (!Array.isArray(body.cart) || body.cart.length === 0 || body.cart.length > MAX_LINES) {
      return err('কার্ট খালি বা সঠিক নয় — পেজ রিফ্রেশ করে আবার চেষ্টা করুন', 400);
    }
    const qtyById = new Map();
    for (const line of body.cart) {
      const id = Number(line && line.id), qty = Number(line && line.qty);
      if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
        return err('কার্টে ভুল তথ্য আছে — পেজ রিফ্রেশ করে আবার চেষ্টা করুন', 400);
      }
      qtyById.set(id, (qtyById.get(id) || 0) + qty);
    }
    const ids = [...qtyById.keys()];
    const found = await env.DB.prepare(
      `SELECT id, name, e, price, stock FROM products WHERE id IN (${ids.map(() => '?').join(',')})`
    ).bind(...ids).all();
    const byId = new Map((found.results || []).map((p) => [p.id, p]));

    let subtotal = 0;
    const lines = [];
    for (const [id, qty] of qtyById) {
      const p = byId.get(id);
      if (!p) return err('কার্টের একটি পণ্য আর পাওয়া যাচ্ছে না — পেজ রিফ্রেশ করে আবার চেষ্টা করুন', 409);
      if (p.stock !== null && p.stock !== undefined && p.stock < qty) {
        return err(`"${p.name}" এর স্টকে মাত্র ${Math.max(0, p.stock)}টি আছে — পরিমাণ কমিয়ে আবার চেষ্টা করুন`, 409);
      }
      const price = Math.round(Number(p.price) || 0);
      subtotal += price * qty;
      lines.push({ p, qty, price });
    }

    // ---- সেটিংস, কুপন, ডেলিভারি ফি, মোট ----
    let settings = {};
    try {
      settings = (await env.DB.prepare(
        'SELECT invoice_prefix, currency, delivery_charge_dhaka, delivery_charge_outside, free_delivery_threshold FROM settings WHERE id = 1'
      ).first()) || {};
    } catch (e) { /* পুরনো স্কিমায় কলাম না থাকলে ডিফল্ট মান ব্যবহার হবে */ }
    const currency = settings.currency || '৳';

    let coupon = null, discount = 0, freeShipping = false;
    const couponCodeIn = str(body.couponCode, 50);
    if (couponCodeIn) {
      const r = await evaluateCoupon(env, couponCodeIn, subtotal, phone);
      if (!r.ok) return err(r.error, r.status);
      coupon = r.coupon; discount = r.discount; freeShipping = r.freeShipping;
    }
    const deliveryFee = computeDeliveryFee(settings, district, subtotal, freeShipping);
    const total = Math.max(0, subtotal + deliveryFee - discount);
    const itemLines = lines.map((l) => `${l.p.e || '📦'} ${l.p.name} × ${l.qty} — ${currency}${l.price * l.qty}`);

    // ---- কুপন ব্যবহার একবারেই "দাবি" (একসাথে অনেকে ব্যবহার করলেও সীমা পার হবে না) ----
    if (coupon) {
      const claim = await env.DB.prepare(
        'UPDATE coupons SET used_count = used_count + 1 WHERE id = ? AND (usage_limit IS NULL OR usage_limit = 0 OR used_count < usage_limit)'
      ).bind(coupon.id).run();
      if (!claim.meta || !claim.meta.changes) return err('এই কুপনের ব্যবহারসীমা শেষ হয়ে গেছে', 400);
      claimedCouponId = coupon.id;
    }

    const customer = await getCustomerFromRequest(request, env);
    const invoiceNo = (settings.invoice_prefix || 'INV') + '-' + Date.now().toString().slice(-8);
    let orderNo = ORDER_NO_RE.test(str(body.orderNo, 20)) ? str(body.orderNo, 20) : genOrderNo();

    let saved = false;
    for (let attempt = 0; attempt < 4 && !saved; attempt++) {
      try {
        await env.DB.prepare(
          `INSERT INTO orders (order_no, customer_id, name, phone, address, district, payment, note, items, subtotal, delivery_fee, total, status, coupon_code, discount, invoice_no)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
        ).bind(
          orderNo, customer ? customer.id : null, name, phone, address, district || null, payment || null, note || null,
          JSON.stringify(itemLines), subtotal, deliveryFee, total, coupon ? coupon.code : null, discount, invoiceNo
        ).run();
        saved = true;
      } catch (e) {
        if (/UNIQUE/i.test(String(e && e.message))) { orderNo = genOrderNo(); continue; } // একই নম্বর আগে থাকলে নতুন নম্বর
        throw e;
      }
    }
    if (!saved) throw new Error('order number collision');

    return json({
      ok: true, orderNo, invoiceNo, subtotal, deliveryFee, discount, total,
      couponCode: coupon ? coupon.code : null, items: itemLines,
    });
  } catch (e) {
    console.error('order save failed:', e && e.message);
    if (claimedCouponId) { // অর্ডার সেভ না হলে কুপনের ব্যবহার ফেরত দেওয়া
      try { await env.DB.prepare('UPDATE coupons SET used_count = MAX(0, used_count - 1) WHERE id = ?').bind(claimedCouponId).run(); } catch (e2) { /* ignore */ }
    }
    return err('অর্ডার সংরক্ষণ করা যায়নি', 500);
  }
}
