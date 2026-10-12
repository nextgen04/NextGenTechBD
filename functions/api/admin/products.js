// /api/admin/products — অ্যাডমিন প্যানেলের পণ্য ম্যানেজমেন্ট (X-Admin-Key হেডার লাগবে)
// GET    → সব পণ্যের তালিকা
// POST   → নতুন পণ্য তৈরি অথবা (body.id দিলে) বিদ্যমান পণ্য আপডেট
// DELETE → ?id=123 দিয়ে পণ্য মুছে ফেলা
import { json, err, requireAdmin, parseListField } from '../../_lib/utils.js';

// Super Admin পণ্যটি কোনো Seller-কে দিতে পারেন (seller_id = সংখ্যা) অথবা প্ল্যাটফর্মের নিজের করতে পারেন (seller_id = null/"")।
// seller_id ফিল্ড না পাঠালে কিছুই বদলায় না। Seller আসলেই আছে কি না যাচাই হয়।
async function assignSeller(env, productId, sellerId) {
  if (sellerId === undefined) return;
  if (sellerId === null || sellerId === '' || sellerId === 0 || sellerId === '0') {
    await env.DB.prepare('UPDATE products SET seller_id = NULL WHERE id = ?').bind(productId).run();
    return;
  }
  const sid = Number(sellerId);
  const ok = Number.isInteger(sid) && sid > 0 && (await env.DB.prepare('SELECT id FROM sellers WHERE id = ?').bind(sid).first());
  if (ok) await env.DB.prepare('UPDATE products SET seller_id = ? WHERE id = ?').bind(sid, productId).run();
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  try {
    // Multi-Vendor: কোন পণ্য কোন Seller-এর (seller_id/shop) তাও আসে; migrations/009 না চালানো থাকলে আগের মতো চলে
    let res;
    try {
      res = await env.DB.prepare(
        `SELECT p.id, p.cat, p.name, p.name_en, p.price, p.old, p.e, p.img, p.r, p.rv, p.sold, p.tag, p.f, p.colors, p.sizes, p.sku, p.stock, p.low_stock_at, p.seller_id, s.shop_name AS shop
         FROM products p LEFT JOIN sellers s ON s.id = p.seller_id ORDER BY p.id DESC`
      ).all();
    } catch (e2) {
      res = await env.DB.prepare(
        'SELECT id, cat, name, name_en, price, old, e, img, r, rv, sold, tag, f, colors, sizes, sku, stock, low_stock_at FROM products ORDER BY id DESC'
      ).all();
    }
    const products = (res.results || []).map((p) => ({
      ...p,
      colors: parseListField(p.colors) || [],
      sizes: parseListField(p.sizes) || [],
    }));
    return json({ products });
  } catch (e) {
    console.error('admin/products failed:', e && e.message);
    return err('পণ্য লোড করা যায়নি', 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  try {
    const b = await request.json();
    if (!b.name || !b.cat || b.price === undefined) {
      return err('নাম, ক্যাটাগরি ও মূল্য আবশ্যক', 400);
    }
    const colors = Array.isArray(b.colors) && b.colors.length ? JSON.stringify(b.colors) : null;
    const sizes = Array.isArray(b.sizes) && b.sizes.length ? JSON.stringify(b.sizes) : null;
    const f = b.f ? 1 : 0;
    const stock = b.stock !== undefined && b.stock !== '' ? Number(b.stock) : null;
    const lowStockAt = b.low_stock_at !== undefined && b.low_stock_at !== '' ? Number(b.low_stock_at) : 5;

    if (b.id) {
      await env.DB.prepare(
        `UPDATE products SET cat=?, name=?, name_en=?, price=?, old=?, e=?, img=?, r=?, rv=?, sold=?, tag=?, f=?, colors=?, sizes=?, sku=?, stock=?, low_stock_at=? WHERE id=?`
      )
        .bind(
          b.cat, b.name, b.name_en || null, Number(b.price), b.old ? Number(b.old) : null,
          b.e || null, b.img || null, b.r ? Number(b.r) : null, b.rv ? Number(b.rv) : null,
          b.sold ? Number(b.sold) : null, b.tag || null, f, colors, sizes,
          b.sku || null, stock, lowStockAt, Number(b.id)
        )
        .run();
      await assignSeller(env, Number(b.id), b.seller_id);
      return json({ ok: true, id: Number(b.id) });
    } else {
      const res = await env.DB.prepare(
        `INSERT INTO products (cat, name, name_en, price, old, e, img, r, rv, sold, tag, f, colors, sizes, sku, stock, low_stock_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          b.cat, b.name, b.name_en || null, Number(b.price), b.old ? Number(b.old) : null,
          b.e || null, b.img || null, b.r ? Number(b.r) : null, b.rv ? Number(b.rv) : null,
          b.sold ? Number(b.sold) : null, b.tag || null, f, colors, sizes,
          b.sku || null, stock, lowStockAt
        )
        .run();
      await assignSeller(env, res.meta.last_row_id, b.seller_id);
      return json({ ok: true, id: res.meta.last_row_id });
    }
  } catch (e) {
    console.error('admin/products failed:', e && e.message);
    return err('পণ্য সংরক্ষণ করা যায়নি', 500);
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return err('id প্যারামিটার আবশ্যক', 400);
    const pid = Number(id);
    // স্টক-হিস্টোরি ও রিভিউ (FOREIGN KEY) আগে মুছে তারপর পণ্য — নইলে অর্ডার-হওয়া পণ্য মুছতে গেলে ব্যর্থ হয়; অর্ডারের পুরোনো রেকর্ড (order_items) অক্ষত থাকে
    await env.DB.batch([
      env.DB.prepare('DELETE FROM stock_history WHERE product_id = ?').bind(pid),
      env.DB.prepare('DELETE FROM reviews WHERE product_id = ?').bind(pid),
      env.DB.prepare('DELETE FROM products WHERE id = ?').bind(pid),
    ]);
    return json({ ok: true });
  } catch (e) {
    console.error('admin/products failed:', e && e.message);
    return err('পণ্য মুছা যায়নি', 500);
  }
}
