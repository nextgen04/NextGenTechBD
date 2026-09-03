// /api/admin/products — অ্যাডমিন প্যানেলের পণ্য ম্যানেজমেন্ট (X-Admin-Key হেডার লাগবে)
// GET    → সব পণ্যের তালিকা
// POST   → নতুন পণ্য তৈরি অথবা (body.id দিলে) বিদ্যমান পণ্য আপডেট
// DELETE → ?id=123 দিয়ে পণ্য মুছে ফেলা
import { json, err, requireAdmin, parseListField } from '../../_lib/utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  try {
    const res = await env.DB.prepare(
      'SELECT id, cat, name, name_en, price, old, e, img, r, rv, sold, tag, f, colors, sizes FROM products ORDER BY id DESC'
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
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  try {
    const b = await request.json();
    if (!b.name || !b.cat || b.price === undefined) {
      return err('নাম, ক্যাটাগরি ও মূল্য আবশ্যক', 400);
    }
    const colors = Array.isArray(b.colors) && b.colors.length ? JSON.stringify(b.colors) : null;
    const sizes = Array.isArray(b.sizes) && b.sizes.length ? JSON.stringify(b.sizes) : null;
    const f = b.f ? 1 : 0;

    if (b.id) {
      await env.DB.prepare(
        `UPDATE products SET cat=?, name=?, name_en=?, price=?, old=?, e=?, img=?, r=?, rv=?, sold=?, tag=?, f=?, colors=?, sizes=? WHERE id=?`
      )
        .bind(
          b.cat, b.name, b.name_en || null, Number(b.price), b.old ? Number(b.old) : null,
          b.e || null, b.img || null, b.r ? Number(b.r) : null, b.rv ? Number(b.rv) : null,
          b.sold ? Number(b.sold) : null, b.tag || null, f, colors, sizes, Number(b.id)
        )
        .run();
      return json({ ok: true, id: Number(b.id) });
    } else {
      const res = await env.DB.prepare(
        `INSERT INTO products (cat, name, name_en, price, old, e, img, r, rv, sold, tag, f, colors, sizes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          b.cat, b.name, b.name_en || null, Number(b.price), b.old ? Number(b.old) : null,
          b.e || null, b.img || null, b.r ? Number(b.r) : null, b.rv ? Number(b.rv) : null,
          b.sold ? Number(b.sold) : null, b.tag || null, f, colors, sizes
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
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return err('id প্যারামিটার আবশ্যক', 400);
    await env.DB.prepare('DELETE FROM products WHERE id = ?').bind(Number(id)).run();
    return json({ ok: true });
  } catch (e) {
    return err('পণ্য মুছা যায়নি: ' + e.message, 500);
  }
}
