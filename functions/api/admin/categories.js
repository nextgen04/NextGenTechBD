// /api/admin/categories — অ্যাডমিন প্যানেলের ক্যাটাগরি ম্যানেজমেন্ট (X-Admin-Key হেডার লাগবে)
// GET    → সব ক্যাটাগরির তালিকা
// POST   → নতুন ক্যাটাগরি তৈরি অথবা (আইডি আগে থেকে থাকলে) আপডেট
// DELETE → ?id=e দিয়ে ক্যাটাগরি মুছে ফেলা
import { json, err, requireAdmin } from '../../_lib/utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  try {
    const res = await env.DB.prepare(
      'SELECT id, name, name_en, e, img, sort_order FROM categories ORDER BY sort_order ASC, rowid ASC'
    ).all();
    return json({ categories: res.results || [] });
  } catch (e) {
    return err('ক্যাটাগরি লোড করা যায়নি: ' + e.message, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  try {
    const b = await request.json();
    if (!b.id || !b.name) return err('আইডি ও নাম আবশ্যক', 400);

    const existing = await env.DB.prepare('SELECT id FROM categories WHERE id = ?').bind(b.id).first();
    if (existing) {
      await env.DB.prepare('UPDATE categories SET name=?, name_en=?, e=?, img=?, sort_order=? WHERE id=?')
        .bind(b.name, b.name_en || null, b.e || null, b.img || null, Number(b.sort_order) || 0, b.id)
        .run();
    } else {
      await env.DB.prepare('INSERT INTO categories (id, name, name_en, e, img, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(b.id, b.name, b.name_en || null, b.e || null, b.img || null, Number(b.sort_order) || 0)
        .run();
    }
    return json({ ok: true, id: b.id });
  } catch (e) {
    return err('ক্যাটাগরি সংরক্ষণ করা যায়নি: ' + e.message, 500);
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return err('id প্যারামিটার আবশ্যক', 400);
    const inUse = await env.DB.prepare('SELECT COUNT(*) as c FROM products WHERE cat = ?').bind(id).first();
    if (inUse && inUse.c > 0) {
      return err('এই ক্যাটাগরিতে এখনো পণ্য আছে — আগে পণ্যগুলো সরান বা অন্য ক্যাটাগরিতে নিন', 400);
    }
    await env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();
    return json({ ok: true });
  } catch (e) {
    return err('ক্যাটাগরি মুছা যায়নি: ' + e.message, 500);
  }
}
