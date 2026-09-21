// /api/admin/customers — অ্যাডমিন প্যানেলে কাস্টমার ম্যানেজমেন্ট (X-Admin-Key হেডার লাগবে)
// GET   → ?q=সার্চ দিয়ে সব কাস্টমারের তালিকা, প্রতিটার সাথে অর্ডার সংখ্যা ও মোট কেনাকাটার পরিমাণ
// PATCH → { id, blocked?, notes? } দিয়ে ব্লক/আনব্লক অথবা নোট আপডেট
import { json, err, requireAdmin } from '../../_lib/utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  try {
    const q = (new URL(request.url).searchParams.get('q') || '').trim();
    let sql = `
      SELECT c.id, c.name, c.phone, c.email, c.blocked, c.notes, c.created_at,
             COUNT(o.id) as total_orders,
             COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN o.total ELSE 0 END), 0) as total_spent,
             SUM(CASE WHEN o.status = 'delivered' THEN 1 ELSE 0 END) as completed_orders,
             SUM(CASE WHEN o.status IN ('pending','processing','confirmed','shipped') THEN 1 ELSE 0 END) as pending_orders
      FROM customers c
      LEFT JOIN orders o ON o.customer_id = c.id
    `;
    const binds = [];
    if (q) {
      sql += ' WHERE c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?';
      const like = '%' + q + '%';
      binds.push(like, like, like);
    }
    sql += ' GROUP BY c.id ORDER BY c.id DESC LIMIT 300';

    const res = await env.DB.prepare(sql).bind(...binds).all();
    return json({ customers: res.results || [] });
  } catch (e) {
    return err('কাস্টমার লোড করা যায়নি: ' + e.message, 500);
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
    if (b.blocked !== undefined) { sets.push('blocked = ?'); binds.push(b.blocked ? 1 : 0); }
    if (b.notes !== undefined) { sets.push('notes = ?'); binds.push(b.notes || null); }
    if (!sets.length) return err('আপডেট করার মতো কোনো তথ্য দেওয়া হয়নি', 400);
    binds.push(Number(b.id));
    await env.DB.prepare(`UPDATE customers SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
    return json({ ok: true });
  } catch (e) {
    return err('আপডেট করা যায়নি: ' + e.message, 500);
  }
}
