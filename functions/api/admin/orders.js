// /api/admin/orders — অ্যাডমিন প্যানেলে অর্ডারের তালিকা, সার্চ/ফিল্টার ও আপডেট (X-Admin-Key হেডার লাগবে)
// GET   → ?q=সার্চ-টার্ম&status=pending দিয়ে সার্চ/ফিল্টার সহ অর্ডার তালিকা
// PATCH → { id, status?, courier?, tracking_id?, payment_status?, note? } দিয়ে অর্ডার আপডেট
//         status বদলালে order_status_history-তে স্বয়ংক্রিয়ভাবে এন্ট্রি হয়
import { json, err, requireAdmin, ORDER_STATUSES } from '../../_lib/utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim();
    const status = (url.searchParams.get('status') || '').trim();

    let sql =
      'SELECT id, order_no, name, phone, address, district, payment, note, items, subtotal, delivery_fee, total, status, courier, tracking_id, payment_status, coupon_code, discount, invoice_no, created_at FROM orders WHERE 1=1';
    const binds = [];
    if (q) {
      sql += ' AND (order_no LIKE ? OR name LIKE ? OR phone LIKE ?)';
      const like = '%' + q + '%';
      binds.push(like, like, like);
    }
    if (status && ORDER_STATUSES.includes(status)) {
      sql += ' AND status = ?';
      binds.push(status);
    }
    sql += ' ORDER BY id DESC LIMIT 300';

    const res = await env.DB.prepare(sql).bind(...binds).all();
    const orders = (res.results || []).map((o) => {
      let items = [];
      try { items = JSON.parse(o.items); } catch (e) { items = o.items; }
      return { ...o, items };
    });
    return json({ orders });
  } catch (e) {
    return err('অর্ডার লোড করা যায়নি: ' + e.message, 500);
  }
}

export async function onRequestPatch(context) {
  const { request, env } = context;
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  try {
    const b = await request.json();
    if (!b.id) return err('id আবশ্যক', 400);
    const id = Number(b.id);

    const sets = [];
    const binds = [];

    if (b.status !== undefined) {
      if (!ORDER_STATUSES.includes(b.status)) return err('সঠিক status দিন', 400);
      sets.push('status = ?');
      binds.push(b.status);
    }
    if (b.courier !== undefined) { sets.push('courier = ?'); binds.push(b.courier || null); }
    if (b.tracking_id !== undefined) { sets.push('tracking_id = ?'); binds.push(b.tracking_id || null); }
    if (b.payment_status !== undefined) { sets.push('payment_status = ?'); binds.push(b.payment_status || 'unpaid'); }

    if (!sets.length) return err('আপডেট করার মতো কোনো তথ্য দেওয়া হয়নি', 400);

    binds.push(id);
    await env.DB.prepare(`UPDATE orders SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();

    if (b.status !== undefined) {
      await env.DB.prepare('INSERT INTO order_status_history (order_id, status, note) VALUES (?, ?, ?)')
        .bind(id, b.status, b.note || null)
        .run();
    }

    return json({ ok: true });
  } catch (e) {
    return err('আপডেট করা যায়নি: ' + e.message, 500);
  }
}
