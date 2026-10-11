// /api/admin/products — অ্যাডমিন প্যানেলের পণ্য ম্যানেজমেন্ট (X-Admin-Key হেডার লাগবে)
// GET    → সব পণ্যের তালিকা
// POST   → নতুন পণ্য তৈরি অথবা (body.id দিলে) বিদ্যমান পণ্য আপডেট
// DELETE → ?id=123 দিয়ে পণ্য মুছে ফেলা
import { json, err, parseListField } from '../../_lib/utils.js';
import { requireAdmin } from '../../_lib/auth.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  try {
    const res = await env.DB.prepare(
      `SELECT p.id, p.cat, p.name, p.name_en, p.price, p.old, p.e, p.img, p.r, p.rv, p.sold, p.tag, p.f, p.colors, p.sizes, p.sku, p.stock, p.low_stock_at,
              p.seller_id, p.status, s.store_name AS seller_name, s.slug AS seller_slug
       FROM products p LEFT JOIN sellers s ON s.id = p.seller_id ORDER BY p.id DESC`
    ).all();
    const products = (res.results || []).map((p) => ({
      ...p,
      colors: parseListField(p.colors) || [],
      sizes: parseListField(p.sizes) || [],
    }));
    return json({ products });
  } catch (e) {
    return err('পণ্য লোড করা যায়নি: ' + e.message, 500);
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

    // নতুন পণ্যের মালিক: body.seller_id (সক্রিয়, সিস্টেম নয় এমন সেলার) অথবা ডিফল্ট "NextGenTechBD Official"
    const status = b.status === undefined ? undefined : (['active', 'inactive', 'draft'].includes(b.status) ? b.status : null);
    if (status === null) return err('স্ট্যাটাস সঠিক নয়', 400);
    let ownerId = null;
    if (!b.id) {
      const wanted = b.seller_id ? Number(b.seller_id) : null;
      const owner = wanted
        ? await env.DB.prepare('SELECT id FROM sellers WHERE id = ? AND deleted_at IS NULL').bind(wanted).first()
        : await env.DB.prepare("SELECT id FROM sellers WHERE seller_code = 'SYS-OFFICIAL'").first();
      if (!owner) return err('সেলার পাওয়া যায়নি', 400);
      ownerId = owner.id;
    }

    if (b.id) {
      await env.DB.prepare(
        `UPDATE products SET cat=?, name=?, name_en=?, price=?, old=?, e=?, img=?, r=?, rv=?, sold=?, tag=?, f=?, colors=?, sizes=?, sku=?, stock=?, low_stock_at=?, status=COALESCE(?, status), updated_at=datetime('now') WHERE id=?`
      )
        .bind(
          b.cat, b.name, b.name_en || null, Number(b.price), b.old ? Number(b.old) : null,
          b.e || null, b.img || null, b.r ? Number(b.r) : null, b.rv ? Number(b.rv) : null,
          b.sold ? Number(b.sold) : null, b.tag || null, f, colors, sizes,
          b.sku || null, stock, lowStockAt, status || null, Number(b.id)
        )
        .run();
      return json({ ok: true, id: Number(b.id) });
    } else {
      const res = await env.DB.prepare(
        `INSERT INTO products (cat, name, name_en, price, old, e, img, r, rv, sold, tag, f, colors, sizes, sku, stock, low_stock_at, seller_id, status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
        .bind(
          b.cat, b.name, b.name_en || null, Number(b.price), b.old ? Number(b.old) : null,
          b.e || null, b.img || null, b.r ? Number(b.r) : null, b.rv ? Number(b.rv) : null,
          b.sold ? Number(b.sold) : null, b.tag || null, f, colors, sizes,
          b.sku || null, stock, lowStockAt, ownerId, status || 'active'
        )
        .run();
      return json({ ok: true, id: res.meta.last_row_id });
    }
  } catch (e) {
    return err('পণ্য সংরক্ষণ করা যায়নি: ' + e.message, 500);
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  try {
    const id = Number(new URL(request.url).searchParams.get('id'));
    if (!Number.isInteger(id) || id < 1) return err('id প্যারামিটার আবশ্যক', 400);
    const p = await env.DB.prepare('SELECT id FROM products WHERE id = ?').bind(id).first();
    if (!p) return err('পণ্য পাওয়া যায়নি', 404);
    // অর্ডারে থাকা পণ্য মুছলে অর্ডার-ইতিহাসের সম্পর্ক (FK) ভাঙে — তাই আর্কাইভ (inactive); অর্ডারবিহীন হলে স্টক-ইতিহাস/রিভিউসহ মুছে যায়
    const used = await env.DB.prepare('SELECT COUNT(*) AS c FROM order_items WHERE product_id = ?').bind(id).first();
    if (used && used.c > 0) {
      await env.DB.prepare(`UPDATE products SET status = 'inactive', updated_at = datetime('now') WHERE id = ?`).bind(id).run();
      return json({ ok: true, archived: true, message: 'এই পণ্যের অর্ডার আছে — মোছার বদলে নিষ্ক্রিয় (আর্কাইভ) করা হয়েছে' });
    }
    await env.DB.batch([
      env.DB.prepare('DELETE FROM stock_history WHERE product_id = ?').bind(id),
      env.DB.prepare('DELETE FROM reviews WHERE product_id = ?').bind(id),
      env.DB.prepare('DELETE FROM product_transfers WHERE product_id = ?').bind(id),
      env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id),
    ]);
    return json({ ok: true });
  } catch (e) {
    return err('পণ্য মুছা যায়নি: ' + e.message, 500);
  }
}
