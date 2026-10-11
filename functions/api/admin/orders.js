// /api/admin/orders — অ্যাডমিন প্যানেলে অর্ডারের তালিকা, সার্চ/ফিল্টার ও আপডেট (X-Admin-Key হেডার লাগবে)
// GET   → ?q=সার্চ-টার্ম&status=pending দিয়ে সার্চ/ফিল্টার সহ অর্ডার তালিকা
// PATCH → { id, status?, courier?, tracking_id?, payment_status?, note? } দিয়ে অর্ডার আপডেট
//         status বদলালে order_status_history-তে স্বয়ংক্রিয়ভাবে এন্ট্রি হয়
import { json, err, ORDER_STATUSES } from '../../_lib/utils.js';
import { requireAdmin } from '../../_lib/auth.js';
import { adminSetItemsStatus } from '../../_lib/order-status.js';

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
    const rows = res.results || [];
    // মাল্টি-সেলার: প্রতিটি অর্ডারের আইটেম সেলারসহ (পুরনো অর্ডারে order_items নেই → খালি তালিকা)
    const byOrder = new Map();
    if (rows.length) {
      const ids = rows.map((o) => o.id);
      const its = await env.DB.prepare(
        `SELECT oi.id, oi.order_id, oi.seller_id, s.store_name AS seller_name, oi.product_id, oi.product_name_snapshot AS name, oi.price_snapshot AS price,
                oi.quantity, oi.subtotal, oi.seller_status AS status, oi.courier, oi.tracking_id
         FROM order_items oi LEFT JOIN sellers s ON s.id = oi.seller_id WHERE oi.order_id IN (${ids.map(() => '?').join(',')}) ORDER BY oi.id`
      ).bind(...ids).all();
      for (const it of its.results || []) { if (!byOrder.has(it.order_id)) byOrder.set(it.order_id, []); byOrder.get(it.order_id).push(it); }
    }
    const orders = rows.map((o) => {
      let items = [];
      try { items = JSON.parse(o.items); } catch (e) { items = o.items; }
      return { ...o, items, order_items: byOrder.get(o.id) || [] };
    });
    return json({ orders });
  } catch (e) {
    return err('অর্ডার লোড করা যায়নি: ' + e.message, 500);
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
    // Super Admin override: অর্ডারে সেলার-আইটেম থাকলে নতুন স্ট্যাটাস সব আইটেমে বসে (বাতিল হলে স্টক ফেরত)। নির্দিষ্ট সেলারের আইটেম আলাদা করতে /api/admin/order-items।
    if (b.status !== undefined) {
      const its = await env.DB.prepare('SELECT id, product_id, quantity, seller_id, seller_status FROM order_items WHERE order_id = ?').bind(id).all();
      if ((its.results || []).length) await adminSetItemsStatus(env, its.results, b.status, b.note || null);
    }
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
