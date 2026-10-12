// /api/seller/orders — Seller শুধু সেইসব অর্ডার দেখেন যেগুলোতে তাঁর নিজের পণ্য আছে (পারমিশন: can_order_manage)
// GET   → ?q=…&status=… ; প্রতিটি অর্ডারে শুধু এই Seller-এর লাইনগুলো ও ডেলিভারির জন্য দরকারি কাস্টমার তথ্য (নাম, ফোন, ঠিকানা) থাকে।
//         অন্য Seller-এর লাইন, কাস্টমারের ইমেইল/অ্যাকাউন্ট, কুপন, মোট বিল — কিছুই আসে না।
// PATCH → { order_id, status?, courier?, tracking_id? } — শুধু এই Seller-এর নিজের লাইনগুলো আপডেট হয় (পেমেন্ট স্ট্যাটাস শুধু Super Admin বদলান)
import { json, err, ORDER_STATUSES } from '../../_lib/utils.js';
import { requireSeller, can, forbidden, rollupOrderStatus } from '../../_lib/seller.js';
import { restockCancelled } from '../../_lib/stock.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const { seller, denied } = await requireSeller(request, env);
  if (denied) return denied;
  if (!can(seller, 'can_order_manage')) return forbidden('can_order_manage');
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim().slice(0, 60);
    const status = (url.searchParams.get('status') || '').trim();
    let sql =
      `SELECT oi.id AS line_id, oi.order_id, oi.product_id, oi.name AS item_name, oi.price, oi.qty, oi.line_total,
              oi.status AS item_status, oi.courier, oi.tracking_id, oi.created_at,
              o.order_no, o.name AS customer_name, o.phone, o.address, o.district, o.payment, o.payment_status, o.note
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE oi.seller_id = ?`;
    const binds = [seller.id];
    if (q) { sql += ' AND (o.order_no LIKE ? OR o.name LIKE ? OR o.phone LIKE ?)'; const l = '%' + q + '%'; binds.push(l, l, l); }
    if (status && ORDER_STATUSES.includes(status)) { sql += ' AND oi.status = ?'; binds.push(status); }
    sql += ' ORDER BY oi.id DESC LIMIT 500';
    const res = await env.DB.prepare(sql).bind(...binds).all();

    const byOrder = new Map();
    for (const r of res.results || []) {
      let o = byOrder.get(r.order_id);
      if (!o) {
        o = {
          order_id: r.order_id, order_no: r.order_no, created_at: r.created_at, status: r.item_status, courier: r.courier, tracking_id: r.tracking_id,
          customer: { name: r.customer_name, phone: r.phone, address: r.address, district: r.district },
          payment: r.payment, payment_status: r.payment_status, note: r.note, items: [], my_total: 0,
        };
        byOrder.set(r.order_id, o);
      }
      o.items.push({ product_id: r.product_id, name: r.item_name, price: r.price, qty: r.qty, line_total: r.line_total });
      o.my_total += r.line_total;
    }
    return json({ orders: [...byOrder.values()] });
  } catch (e) {
    console.error('seller/orders GET failed:', e && e.message);
    return err('অর্ডার লোড করা যায়নি', 500);
  }
}

export async function onRequestPatch(context) {
  const { request, env } = context;
  const { seller, denied } = await requireSeller(request, env);
  if (denied) return denied;
  if (!can(seller, 'can_order_manage')) return forbidden('can_order_manage');
  try {
    let b;
    try { b = await request.json(); } catch (e) { return err('অনুরোধ সঠিক নয়', 400); }
    const orderId = Number(b && b.order_id);
    if (!Number.isInteger(orderId) || orderId <= 0) return err('order_id আবশ্যক', 400);

    const sets = [], binds = [];
    if (b.status !== undefined) {
      if (!ORDER_STATUSES.includes(b.status)) return err('সঠিক status দিন', 400);
      sets.push('status = ?'); binds.push(b.status);
    }
    if (b.courier !== undefined) { sets.push('courier = ?'); binds.push(b.courier ? String(b.courier).slice(0, 60) : null); }
    if (b.tracking_id !== undefined) { sets.push('tracking_id = ?'); binds.push(b.tracking_id ? String(b.tracking_id).slice(0, 80) : null); }
    if (!sets.length) return err('আপডেট করার মতো কোনো তথ্য দেওয়া হয়নি', 400);

    // 🔒 শুধু নিজের লাইন: seller_id শর্ত SQL-এই আছে। অন্য কারও অর্ডার-আইডি দিলে কোনো সারি বদলায় না → 404
    binds.push(orderId, seller.id);
    const r = await env.DB.prepare(`UPDATE order_items SET ${sets.join(', ')} WHERE order_id = ? AND seller_id = ? AND restocked = 0`).bind(...binds).run();
    if (!r.meta || !r.meta.changes) return err('অর্ডার পাওয়া যায়নি (অথবা আগেই বাতিল/রিটার্ন হয়ে গেছে)', 404);

    if (b.status === 'cancelled' || b.status === 'returned') await restockCancelled(env, orderId, seller.id);
    let orderStatus = null;
    if (b.status !== undefined) orderStatus = await rollupOrderStatus(env, orderId);
    return json({ ok: true, order_status: orderStatus });
  } catch (e) {
    console.error('seller/orders PATCH failed:', e && e.message);
    return err('আপডেট করা যায়নি', 500);
  }
}
