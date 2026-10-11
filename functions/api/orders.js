// POST /api/orders — কাস্টমার চেকআউট করলে অর্ডারটি D1 ডেটাবেজে সংরক্ষণ হয়
// (হোয়াটসঅ্যাপ মেসেজ ফ্রন্টএন্ড থেকে আগের মতোই পাঠানো হয়, এটা শুধু ব্যাকআপ/অ্যাডমিন রেকর্ড হিসেবে থাকে)
// গ্রাহক লগইন করা থাকলে (X-Session-Token হেডার থাকলে) অর্ডারটি তার অ্যাকাউন্টের সাথে যুক্ত হয়ে যায়,
// যাতে সে পরে "আমার অর্ডার হিস্টোরি"তে এটা দেখতে পায়। লগইন না থাকলেও (গেস্ট চেকআউট) অর্ডার আইডি +
// মোবাইল নম্বর দিয়ে /orders পেজ থেকে ট্র্যাক করা যাবে।
//
// দুটি পথ:
//  ১) মাল্টি-সেলার (নতুন): body.lines = [{ id, qty }] থাকলে সার্ভার নিজে DB থেকে দাম/সেলার/স্টক/ডেলিভারি/কুপন হিসাব করে;
//     ক্লায়েন্টের পাঠানো subtotal/total/discount/items উপেক্ষা করা হয়। order_items তৈরি হয়, স্টক কমে।
//  ২) legacy: lines না থাকলে (পুরনো ক্যাশড ফ্রন্টএন্ড) আগের মতোই অর্ডার সেভ হয় — order_items ছাড়া, শুধু Super Admin দেখে।
import { json, err, getCustomerFromRequest } from '../_lib/utils.js';
import { resolveLines, sellerSubtotalsOf, subtotalOf, deliveryFee } from '../_lib/checkout.js';
import { evaluateCoupon } from '../_lib/coupons.js';

const money = (n) => '৳' + Number(n).toLocaleString('en-US');
const newOrderNo = () => 'SB' + Date.now().toString().slice(-8) + String(Math.floor(Math.random() * 90) + 10);

async function invoiceNoFor(env) {
  let row = null;
  try { row = await env.DB.prepare('SELECT invoice_prefix FROM settings WHERE id = 1').first(); } catch (e) { /* পুরনো স্কিমায় কলাম না থাকলে চুপচাপ এড়িয়ে যাওয়া */ }
  return ((row && row.invoice_prefix) || 'INV') + '-' + Date.now().toString().slice(-8);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch (e) { return err('অবৈধ রিকোয়েস্ট', 400); }
  body = body || {};
  if (body.lines !== undefined) return marketplaceCheckout(request, env, body);
  return legacyCheckout(request, env, body);
}

/* ================= মাল্টি-সেলার চেকআউট ================= */
async function marketplaceCheckout(request, env, body) {
  const name = String(body.name || '').trim(), phone = String(body.phone || '').trim(), address = String(body.address || '').trim();
  const district = body.district ? String(body.district).trim().slice(0, 60) : null;
  const payment = body.payment ? String(body.payment).trim().slice(0, 60) : null;
  const note = body.note ? String(body.note).trim().slice(0, 200) : null;
  if (name.length < 3 || name.length > 100) return json({ error: 'নাম কমপক্ষে ৩ অক্ষরের হতে হবে', code: 'BAD_CUSTOMER' }, 400);
  if (!/^01[3-9]\d{8}$/.test(phone)) return json({ error: 'সঠিক মোবাইল নম্বর দিন (01XXXXXXXXX)', code: 'BAD_CUSTOMER' }, 400);
  if (address.length < 10 || address.length > 300) return json({ error: 'ঠিকানা কমপক্ষে ১০ অক্ষরের হতে হবে', code: 'BAD_CUSTOMER' }, 400);

  // অপব্যবহার-রোধ: একই মোবাইল থেকে ১০ মিনিটে ৫টির বেশি অর্ডার নয় (জাল অর্ডার দিয়ে অন্যদের স্টক আটকে রাখা ঠেকাতে)
  const recent = await env.DB.prepare(`SELECT COUNT(*) AS c FROM orders WHERE phone = ? AND created_at >= datetime('now', '-10 minutes')`).bind(phone).first();
  if (recent && recent.c >= 5) return json({ error: 'অল্প সময়ে অনেকগুলো অর্ডার হয়েছে — কিছুক্ষণ পর আবার চেষ্টা করুন', code: 'RATE_LIMITED' }, 429);

  let resolved;
  try { resolved = await resolveLines(env, body.lines); } catch (e) { return err('অর্ডার যাচাই করা যায়নি: ' + e.message, 500); }
  if (resolved.error) return json({ error: resolved.error, code: resolved.code, product_id: resolved.product_id, available: resolved.available }, resolved.status);
  const lines = resolved.lines;

  const subtotal = subtotalOf(lines);
  let discount = 0, couponCode = null, freeShipping = false;
  if (body.couponCode) {
    const c = await evaluateCoupon(env, { code: body.couponCode, subtotal, phone, sellerSubtotals: sellerSubtotalsOf(lines) });
    if (c.error) return json({ error: c.error, code: 'COUPON' }, c.status);
    discount = Math.min(c.discount, subtotal); couponCode = c.code; freeShipping = c.free_shipping;
  }
  const fee = await deliveryFee(env, { subtotal, district, freeShipping });
  const total = Math.max(0, subtotal + fee - discount);

  // ডাবল-ক্লিক/রিট্রাই: একই orderNo + একই মোবাইলে অর্ডার আগেই সেভ হয়ে থাকলে নতুন অর্ডার/স্টক কাটা ছাড়াই আগেরটাই ফেরত (idempotent)
  if (/^[A-Za-z0-9-]{4,24}$/.test(String(body.orderNo || ''))) {
    const prev = await env.DB.prepare('SELECT id, order_no, invoice_no, subtotal, delivery_fee, discount, total FROM orders WHERE order_no = ? AND phone = ?').bind(String(body.orderNo), phone).first();
    if (prev) {
      const its = await env.DB.prepare('SELECT product_id, product_name_snapshot AS name, quantity, price_snapshot AS price, seller_id FROM order_items WHERE order_id = ?').bind(prev.id).all();
      return json({ ok: true, duplicate: true, orderNo: prev.order_no, invoiceNo: prev.invoice_no, subtotal: prev.subtotal, deliveryFee: prev.delivery_fee, discount: prev.discount, total: prev.total,
        sellers: new Set((its.results || []).map((r) => r.seller_id)).size, items: (its.results || []).map((r) => ({ id: r.product_id, name: r.name, qty: r.quantity, price: r.price })) }, 200);
    }
  }
  // অর্ডার নম্বর: ক্লায়েন্টেরটা বৈধ ও অব্যবহৃত হলে সেটাই, নইলে সার্ভার নতুন বানায়
  let orderNo = /^[A-Za-z0-9-]{4,24}$/.test(String(body.orderNo || '')) ? String(body.orderNo) : newOrderNo();
  for (let i = 0; i < 5 && await env.DB.prepare('SELECT id FROM orders WHERE order_no = ?').bind(orderNo).first(); i++) orderNo = newOrderNo();

  // ধাপ ১: স্টক কাটা (শর্তসহ — একসাথে দুজন কিনলে ঋণাত্মক হয় না)। ব্যর্থ হলে যা কাটা হয়েছিল ফেরত।
  const tracked = lines.filter((l) => l.product.stock !== null && l.product.stock !== undefined);
  const restore = async (ls) => { if (ls.length) await env.DB.batch(ls.map((l) => env.DB.prepare('UPDATE products SET stock = stock + ? WHERE id = ? AND stock IS NOT NULL').bind(l.qty, l.product.id))); };
  let deducted = [];
  try {
    if (tracked.length) {
      const rs = await env.DB.batch(tracked.map((l) => env.DB.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock IS NOT NULL AND stock >= ?').bind(l.qty, l.product.id, l.qty)));
      deducted = tracked.filter((_, i) => rs[i] && rs[i].meta && rs[i].meta.changes > 0);
      if (deducted.length !== tracked.length) {
        await restore(deducted);
        const bad = tracked.find((l) => !deducted.includes(l));
        return json({ error: `"${bad.product.name}" এর স্টক এইমাত্র শেষ হয়ে গেছে — সংখ্যা কমিয়ে আবার চেষ্টা করুন`, code: 'OUT_OF_STOCK', product_id: bad.product.id }, 409);
      }
    }
  } catch (e) { try { await restore(deducted); } catch (e2) { /* ignore */ } return err('স্টক হালনাগাদ করা যায়নি: ' + e.message, 500); }

  // ধাপ ২: অর্ডার + আইটেম + স্টক-ইতিহাস + কুপন কাউন্ট
  const customer = await getCustomerFromRequest(request, env);
  const itemLines = lines.map((l) => `${l.product.e || '📦'} ${l.product.name} × ${l.qty} — ${money(l.product.price * l.qty)}`);
  let orderId = null, invoiceNo = null;
  try {
    invoiceNo = await invoiceNoFor(env);
    const r = await env.DB.prepare(
      `INSERT INTO orders (order_no, customer_id, name, phone, address, district, payment, note, items, subtotal, delivery_fee, total, status, coupon_code, discount, invoice_no)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
    ).bind(orderNo, customer ? customer.id : null, name, phone, address, district, payment, note, JSON.stringify(itemLines), subtotal, fee, total, couponCode, discount, invoiceNo).run();
    orderId = r.meta.last_row_id;

    const stmts = [];
    for (const l of lines) {
      const sub = l.product.price * l.qty;
      const commission = Math.round((sub * l.commission_percent) / 100);
      stmts.push(env.DB.prepare(
        `INSERT INTO order_items (order_id, seller_id, product_id, product_name_snapshot, sku_snapshot, price_snapshot, quantity, subtotal, commission_percent, commission_amount, seller_earning, platform_earning)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(orderId, l.seller.id, l.product.id, l.product.name, l.product.sku || null, l.product.price, l.qty, sub, l.commission_percent, commission, sub - commission, commission));
      if (l.product.stock !== null && l.product.stock !== undefined) {
        stmts.push(env.DB.prepare('INSERT INTO stock_history (product_id, change, reason, seller_id, changed_by) VALUES (?, ?, ?, ?, ?)').bind(l.product.id, -l.qty, `অর্ডার ${orderNo}`, l.seller.id, 'system'));
      }
    }
    if (couponCode) stmts.push(env.DB.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE code = ?').bind(couponCode));
    await env.DB.batch(stmts);
  } catch (e) {
    try { if (orderId) { await env.DB.prepare('DELETE FROM order_items WHERE order_id = ?').bind(orderId).run(); await env.DB.prepare('DELETE FROM orders WHERE id = ?').bind(orderId).run(); } await restore(deducted); } catch (e2) { /* ignore */ }
    return err('অর্ডার সংরক্ষণ করা যায়নি: ' + e.message, 500);
  }

  const sellers = [...new Set(lines.map((l) => l.seller.id))].length;
  return json({ ok: true, orderNo, invoiceNo, subtotal, deliveryFee: fee, discount, total, sellers, itemLines,
    items: lines.map((l) => ({ id: l.product.id, name: l.product.name, qty: l.qty, price: l.product.price, store: l.seller.store_name })) }, 201);
}

/* ================= legacy (পুরনো ক্লায়েন্ট) — আগের আচরণ হুবহু ================= */
async function legacyCheckout(request, env, body) {
  try {
    const { orderNo, name, phone, address, district, payment, note, items, subtotal, deliveryFee: fee, total, couponCode, discount } = body || {};

    if (!orderNo || !name || !phone || !address || !items || total === undefined) {
      return err('অর্ডারের প্রয়োজনীয় তথ্য অনুপস্থিত', 400);
    }

    const customer = await getCustomerFromRequest(request, env);
    const invoiceNo = await invoiceNoFor(env);

    await env.DB.prepare(
      `INSERT INTO orders (order_no, customer_id, name, phone, address, district, payment, note, items, subtotal, delivery_fee, total, status, coupon_code, discount, invoice_no)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
    )
      .bind(
        String(orderNo),
        customer ? customer.id : null,
        String(name),
        String(phone),
        String(address),
        district ? String(district) : null,
        payment ? String(payment) : null,
        note ? String(note) : null,
        typeof items === 'string' ? items : JSON.stringify(items),
        Number(subtotal) || 0,
        Number(fee) || 0,
        Number(total) || 0,
        couponCode ? String(couponCode).toUpperCase() : null,
        Number(discount) || 0,
        invoiceNo
      )
      .run();

    if (couponCode) {
      try {
        await env.DB.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE code = ?').bind(String(couponCode).toUpperCase()).run();
      } catch (e) { /* কুপন কাউন্ট বাড়াতে ব্যর্থ হলেও অর্ডার আটকানো ঠিক না */ }
    }

    return json({ ok: true, orderNo, invoiceNo });
  } catch (e) {
    // অর্ডার সেভ ব্যর্থ হলেও কাস্টমারের চেকআউট আটকানো ঠিক না (হোয়াটসঅ্যাপে অর্ডারটি চলে যাবে) —
    // তাই ফ্রন্টএন্ড এই এরর হলেও চেকআউট সম্পন্ন দেখাবে।
    return err('অর্ডার সংরক্ষণ করা যায়নি: ' + e.message, 500);
  }
}
