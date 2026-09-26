// /api/admin/banners — অ্যাডমিন প্যানেলে ব্যানার/স্লাইডার ম্যানেজমেন্ট (X-Admin-Key হেডার লাগবে)
// GET    → সব ব্যানারের তালিকা
// POST   → নতুন ব্যানার তৈরি অথবা (body.id দিলে) বিদ্যমান ব্যানার আপডেট
// DELETE → ?id=123 দিয়ে ব্যানার মুছে ফেলা
import { json, err, requireAdmin, toBool } from '../../_lib/utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  try {
    const res = await env.DB.prepare(
      'SELECT id, title, subtitle, img, button_text, button_url, position, start_date, end_date, active, sort_order FROM banners ORDER BY position ASC, sort_order ASC, id DESC'
    ).all();
    return json({ banners: res.results || [] });
  } catch (e) {
    return err('ব্যানার লোড করা যায়নি: ' + e.message, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  try {
    const b = await request.json();
    if (!b.title) return err('শিরোনাম আবশ্যক', 400);
    const fields = [
      b.title, b.subtitle || null, b.img || null, b.button_text || null, b.button_url || null,
      (b.position === 'side' ? 'side' : 'hero'),
      b.start_date || null, b.end_date || null, toBool(b.active) ? 1 : 0, Number(b.sort_order) || 0,
    ];
    if (b.id) {
      await env.DB.prepare(
        `UPDATE banners SET title=?, subtitle=?, img=?, button_text=?, button_url=?, position=?, start_date=?, end_date=?, active=?, sort_order=? WHERE id=?`
      ).bind(...fields, Number(b.id)).run();
      return json({ ok: true, id: Number(b.id) });
    } else {
      const res = await env.DB.prepare(
        `INSERT INTO banners (title, subtitle, img, button_text, button_url, position, start_date, end_date, active, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(...fields).run();
      return json({ ok: true, id: res.meta.last_row_id });
    }
  } catch (e) {
    return err('ব্যানার সংরক্ষণ করা যায়নি: ' + e.message, 500);
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return err('id প্যারামিটার আবশ্যক', 400);
    await env.DB.prepare('DELETE FROM banners WHERE id = ?').bind(Number(id)).run();
    return json({ ok: true });
  } catch (e) {
    return err('ব্যানার মুছা যায়নি: ' + e.message, 500);
  }
}
