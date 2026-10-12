// /api/admin/orders — অ্যাডমিন প্যানেলে অর্ডারের তালিকা, সার্চ/ফিল্টার ও আপডেট (X-Admin-Key হেডার লাগবে)
// GET   → ?q=সার্চ-টার্ম&status=pending দিয়ে সার্চ/ফিল্টার সহ অর্ডার তালিকা
// PATCH → { id, status?, courier?, tracking_id?, payment_status?, note? } দিয়ে অর্ডার আপডেট
//         status বদলালে order_status_history-তে স্বয়ংক্রিয়ভাবে এন্ট্রি হয়
import { json, err, requireAdmin, ORDER_STATUSES } from '../../_lib/utils.js';
import { restockCancelled } from '../../_lib/stock.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim();
    const status = (url.searchParams.get('status') || '').trim();

    let sql =
      'SELECT id, order_no, name, phone, address, district, payment, note, items, subtotal, delivery_fee, total, status, courier, tracking_id, payment_status, coupon_code, discount, invoice_no, seen, created_at FROM orders WHERE 1=1';
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
    // Multi-Vendor: কোন Seller কোন অংশ পাঠাচ্ছেন (সাব-অর্ডার) — পুরোনো অর্ডারে খালি থাকে
    try {
      if (orders.length) {
        const ids = orders.map((o) => o.id);
        const sub = await env.DB.prepare(
          `SELECT oi.order_id, oi.seller_id, COALESCE(s.shop_name, 'প্ল্যাটফর্ম') AS shop, oi.name, oi.qty, oi.line_total, oi.status, oi.courier, oi.tracking_id
           FROM order_items oi LEFT JOIN sellers s ON s.id = oi.seller_id WHERE oi.order_id IN (${ids.map(() => '?').join(',')}) ORDER BY oi.id`
        ).bind(...ids).all();
        const m = new Map();
        for (const r of sub.results || []) { if (!m.has(r.order_id)) m.set(r.order_id, []); m.get(r.order_id).push(r); }
        orders.forEach((o) => { o.sub_items = m.get(o.id) || []; });
      }
    } catch (e2) { /* order_items টেবিল না থাকলে (migration বাকি) সাব-অর্ডার ছাড়াই চলবে */ }
    return json({ orders });
  } catch (e) {
    console.error('admin/orders failed:', e && e.message);
    return err('অর্ডার লোড করা যায়নি', 500);
  }
}

export async function onRequestPatch(context) {
  const { request, env } = context;
  const denied = await requireAdmin(request, env);
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
      // Super Admin অর্ডারের মূল status বদলালে সব Seller-লাইনেও একই status বসে (যেমন বাতিল করলে সবার অংশই বাতিল)
      try { await env.DB.prepare('UPDATE order_items SET status = ? WHERE order_id = ? AND restocked = 0').bind(b.status, id).run(); if (b.status === 'cancelled' || b.status === 'returned') await restockCancelled(env, id); } catch (e3) { /* migration বাকি থাকলে বাদ */ }
    }

    return json({ ok: true });
  } catch (e) {
    console.error('admin/orders failed:', e && e.message);
    return err('আপডেট করা যায়নি', 500);
  }
}
