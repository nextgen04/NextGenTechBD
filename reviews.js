// /api/admin/reviews — অ্যাডমিন প্যানেলে রিভিউ মডারেশন (X-Admin-Key হেডার লাগবে)
// GET    → ?status=pending দিয়ে ফিল্টার করে সব রিভিউ (পণ্যের নামসহ)
// PATCH  → { id, status?, featured? } দিয়ে অনুমোদন/বাতিল/ফিচার্ড টগল
// DELETE → ?id=123 দিয়ে রিভিউ মুছে ফেলা
import { json, err, requireAdmin, toBool } from '../../_lib/utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  try {
    const status = (new URL(request.url).searchParams.get('status') || '').trim();
    let sql = `SELECT r.id, r.product_id, r.customer_name, r.rating, r.comment, r.status, r.featured, r.created_at,
                      p.name as product_name
               FROM reviews r LEFT JOIN products p ON p.id = r.product_id`;
    const binds = [];
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      sql += ' WHERE r.status = ?';
      binds.push(status);
    }
    sql += ' ORDER BY r.id DESC LIMIT 300';
    const res = await env.DB.prepare(sql).bind(...binds).all();
    return json({ reviews: res.results || [] });
  } catch (e) {
    return err('রিভিউ লোড করা যায়নি: ' + e.message, 500);
  }
}

export async function onRequestPatch(context) {
  const { request, env } = context;
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  try {
    const b = await request.json();
    if (!b.id) return err('id আবশ্যক', 400);
    const sets = [];
    const binds = [];
    if (b.status !== undefined) {
      if (!['pending', 'approved', 'rejected'].includes(b.status)) return err('সঠিক status দিন', 400);
      sets.push('status = ?');
      binds.push(b.status);
    }
    if (b.featured !== undefined) { sets.push('featured = ?'); binds.push(toBool(b.featured) ? 1 : 0); }
    if (!sets.length) return err('আপডেট করার মতো কোনো তথ্য দেওয়া হয়নি', 400);
    binds.push(Number(b.id));
    await env.DB.prepare(`UPDATE reviews SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
    return json({ ok: true });
  } catch (e) {
    return err('আপডেট করা যায়নি: ' + e.message, 500);
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return err('id প্যারামিটার আবশ্যক', 400);
    await env.DB.prepare('DELETE FROM reviews WHERE id = ?').bind(Number(id)).run();
    return json({ ok: true });
  } catch (e) {
    return err('রিভিউ মুছা যায়নি: ' + e.message, 500);
  }
}
