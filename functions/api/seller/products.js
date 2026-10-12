// /api/seller/products — Seller শুধু নিজের পণ্য দেখতে/বদলাতে পারবেন
// GET    → নিজের পণ্যের তালিকা
// POST   → নতুন পণ্য (পারমিশন: can_product_create) অথবা body.id দিলে আপডেট (পারমিশন: can_product_edit)
// DELETE → ?id=123 (পারমিশন: can_product_delete)
// 🔒 seller_id কখনোই রিকোয়েস্ট বডি থেকে নেওয়া হয় না — সবসময় সেশন থেকে। প্রতিটি UPDATE/DELETE-এ "AND seller_id = ?" শর্ত আছে।
//    অন্য Seller-এর পণ্যের id দিলে "পাওয়া যায়নি" (404) আসে — পণ্যটি আছে কি না তাও বোঝা যায় না।
// ⭐ রেটিং/রিভিউ/বিক্রি-সংখ্যা/ফ্ল্যাশ-সেল/ট্যাগ Seller বদলাতে পারেন না (শুধু Super Admin) — নকল রিভিউ আটকাতে।
import { json, err, parseListField } from '../../_lib/utils.js';
import { requireSeller, can, forbidden, validImageUrl } from '../../_lib/seller.js';

const COLS = 'id, cat, name, name_en, price, old, e, img, sku, stock, low_stock_at, colors, sizes, created_at';

const toInt = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
const list = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim().slice(0, 30)).filter(Boolean).slice(0, 20) : []);

export async function onRequestGet(context) {
  const { request, env } = context;
  const { seller, denied } = await requireSeller(request, env);
  if (denied) return denied;
  try {
    const res = await env.DB.prepare(`SELECT ${COLS} FROM products WHERE seller_id = ? ORDER BY id DESC`).bind(seller.id).all();
    const products = (res.results || []).map((p) => ({ ...p, colors: parseListField(p.colors) || [], sizes: parseListField(p.sizes) || [] }));
    return json({ products });
  } catch (e) {
    console.error('seller/products GET failed:', e && e.message);
    return err('পণ্য লোড করা যায়নি', 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const { seller, denied } = await requireSeller(request, env);
  if (denied) return denied;
  try {
    let b;
    try { b = await request.json(); } catch (e) { return err('অনুরোধ সঠিক নয়', 400); }
    b = b || {};
    const isUpdate = b.id !== undefined && b.id !== null && b.id !== '';
    const perm = isUpdate ? 'can_product_edit' : 'can_product_create';
    if (!can(seller, perm)) return forbidden(perm);

    // ---- ইনপুট যাচাই ----
    const name = String(b.name || '').trim();
    const price = Number(b.price);
    if (name.length < 2 || name.length > 200) return err('পণ্যের নাম ২–২০০ অক্ষরের হতে হবে', 400);
    if (!Number.isInteger(price) || price <= 0 || price > 10000000) return err('সঠিক মূল্য দিন (পূর্ণসংখ্যা, ০-র বেশি)', 400);
    const old = toInt(b.old);
    if (old !== null && (!Number.isInteger(old) || old < 0 || old > 10000000)) return err('আগের মূল্য সঠিক নয়', 400);
    if (!b.cat) return err('ক্যাটাগরি আবশ্যক', 400);
    const cat = await env.DB.prepare('SELECT id FROM categories WHERE id = ?').bind(String(b.cat)).first();
    if (!cat) return err('ক্যাটাগরি সঠিক নয়', 400);
    if (!validImageUrl(env, b.img)) return err('ছবির লিংক সঠিক নয় — ড্যাশবোর্ড থেকে আপলোড করা ছবি ব্যবহার করুন', 400);

    const nameEn = b.name_en ? String(b.name_en).trim().slice(0, 200) : null;
    const e = b.e ? String(b.e).trim().slice(0, 8) : null;
    const sku = b.sku ? String(b.sku).trim().slice(0, 60) : null;
    const colors = list(b.colors), sizes = list(b.sizes);
    const colorsJ = colors.length ? JSON.stringify(colors) : null;
    const sizesJ = sizes.length ? JSON.stringify(sizes) : null;

    // স্টক: শুধু can_stock_manage থাকলে সেট/পরিবর্তন করা যাবে
    const canStock = can(seller, 'can_stock_manage');
    let stock = null, low = null;
    if (canStock) {
      stock = toInt(b.stock);
      low = toInt(b.low_stock_at);
      if (stock !== null && (!Number.isInteger(stock) || stock < 0 || stock > 10000000)) return err('স্টক সঠিক নয়', 400);
      if (low !== null && (!Number.isInteger(low) || low < 0 || low > 100000)) return err('লো-স্টক সংখ্যা সঠিক নয়', 400);
    }

    if (isUpdate) {
      const id = Number(b.id);
      if (!Number.isInteger(id) || id <= 0) return err('পণ্য সঠিক নয়', 400);
      const cur = await env.DB.prepare('SELECT id, stock, low_stock_at FROM products WHERE id = ? AND seller_id = ?').bind(id, seller.id).first();
      if (!cur) return err('পণ্য পাওয়া যায়নি', 404);
      const newStock = canStock ? stock : cur.stock;
      const newLow = canStock ? (low === null ? (cur.low_stock_at ?? 5) : low) : cur.low_stock_at;
      const r = await env.DB.prepare(
        `UPDATE products SET cat=?, name=?, name_en=?, price=?, old=?, e=?, img=?, sku=?, colors=?, sizes=?, stock=?, low_stock_at=?
         WHERE id=? AND seller_id=?`
      ).bind(String(b.cat), name, nameEn, price, old, e, b.img || null, sku, colorsJ, sizesJ, newStock, newLow, id, seller.id).run();
      if (!r.meta || !r.meta.changes) return err('পণ্য পাওয়া যায়নি', 404);
      return json({ ok: true, id });
    }

    // নতুন পণ্য — রেটিং/রিভিউ/বিক্রি ০ থেকে শুরু (স্টোরফ্রন্ট এগুলো সংখ্যা হিসেবেই আশা করে); স্টক পারমিশন না থাকলে ০ (Super Admin পরে সেট করবেন)
    const res = await env.DB.prepare(
      `INSERT INTO products (cat, name, name_en, price, old, e, img, r, rv, sold, tag, f, colors, sizes, sku, stock, low_stock_at, seller_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, NULL, 0, ?, ?, ?, ?, ?, ?)`
    ).bind(String(b.cat), name, nameEn, price, old, e, b.img || null, colorsJ, sizesJ, sku, canStock ? stock : 0, canStock ? (low === null ? 5 : low) : 5, seller.id).run();
    return json({ ok: true, id: res.meta.last_row_id, stock_set: canStock });
  } catch (e) {
    console.error('seller/products POST failed:', e && e.message);
    return err('পণ্য সংরক্ষণ করা যায়নি', 500);
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const { seller, denied } = await requireSeller(request, env);
  if (denied) return denied;
  try {
    if (!can(seller, 'can_product_delete')) return forbidden('can_product_delete');
    const id = Number(new URL(request.url).searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) return err('id প্যারামিটার আবশ্যক', 400);
    const own = await env.DB.prepare('SELECT id FROM products WHERE id = ? AND seller_id = ?').bind(id, seller.id).first();
    if (!own) return err('পণ্য পাওয়া যায়নি', 404);
    // স্টক-হিস্টোরি ও রিভিউ (FOREIGN KEY) আগে মুছে তারপর পণ্য; অর্ডারের পুরোনো রেকর্ড (order_items) অক্ষত থাকে
    await env.DB.batch([
      env.DB.prepare('DELETE FROM stock_history WHERE product_id = ?').bind(id),
      env.DB.prepare('DELETE FROM reviews WHERE product_id = ?').bind(id),
      env.DB.prepare('DELETE FROM products WHERE id = ? AND seller_id = ?').bind(id, seller.id),
    ]);
    return json({ ok: true });
  } catch (e) {
    console.error('seller/products DELETE failed:', e && e.message);
    return err('পণ্য মুছা যায়নি', 500);
  }
}
