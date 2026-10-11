// GET   /api/seller/orders  → শুধু এই সেলারের order_items, অর্ডার অনুযায়ী গোছানো (?status=, ?q=অর্ডার নম্বর)
// PATCH /api/seller/orders  → { action: 'mark_seen' } — নতুন-অর্ডার নোটিফিকেশন পড়া হয়েছে
// গ্রাহকের তথ্য শুধু ফুলফিলমেন্টের জন্য যতটুকু লাগে: নাম, ফোন, ঠিকানা, জেলা, পেমেন্ট মাধ্যম, ডেলিভারি নোট (ইমেইল/কুপন/মোট/গ্রাহক আইডি নয়)।
import { json, err, ORDER_STATUSES } from '../../../_lib/utils.js';
import { requireSeller } from '../../../_lib/auth.js';

export const ORDER_ITEM_SELECT = `oi.id AS item_id, oi.order_id, oi.product_id, oi.product_name_snapshot AS product, oi.sku_snapshot AS sku, oi.color, oi.size,
  oi.price_snapshot AS price, oi.quantity, oi.subtotal, oi.seller_status AS status, oi.courier, oi.tracking_id, oi.seller_seen, oi.created_at,
  o.order_no, o.name AS customer_name, o.phone AS customer_phone, o.address, o.district, o.payment, o.note`;

export function groupOrders(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.order_id)) {
      map.set(r.order_id, { order_id: r.order_id, order_no: r.order_no, created_at: r.created_at, customer: { name: r.customer_name, phone: r.customer_phone, address: r.address, district: r.district },
        payment: r.payment, note: r.note, items: [], subtotal: 0, is_new: false });
    }
    const o = map.get(r.order_id);
    o.items.push({ item_id: r.item_id, product: r.product, sku: r.sku, color: r.color, size: r.size, price: r.price, quantity: r.quantity, subtotal: r.subtotal, status: r.status, courier: r.courier, tracking_id: r.tracking_id });
    o.subtotal += r.subtotal;
    if (!r.seller_seen) o.is_new = true;
  }
  return [...map.values()];
}

export async function onRequestGet({ request, env }) {
  const auth = await requireSeller(request, env, { permission: 'orders:read' });
  if (auth.response) return auth.response;
  const u = new URL(request.url);
  const status = u.searchParams.get('status'); const q = (u.searchParams.get('q') || '').trim().slice(0, 40);
  let sql = `SELECT ${ORDER_ITEM_SELECT} FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.seller_id = ?`; const args = [auth.seller.id];
  if (ORDER_STATUSES.includes(status)) { sql += ' AND oi.seller_status = ?'; args.push(status); }
  if (q) { sql += ' AND o.order_no LIKE ?'; args.push(`%${q.replace(/[%_]/g, '')}%`); }
  sql += ' ORDER BY oi.id DESC LIMIT 400';
  const res = await env.DB.prepare(sql).bind(...args).all();
  return json({ orders: groupOrders(res.results || []) });
}

export async function onRequestPatch({ request, env }) {
  const auth = await requireSeller(request, env, { permission: 'orders:read' });
  if (auth.response) return auth.response;
  let b; try { b = await request.json(); } catch (e) { return err('অবৈধ রিকোয়েস্ট', 400); }
  if (!b || b.action !== 'mark_seen') return err('অজানা action', 400);
  await env.DB.prepare('UPDATE order_items SET seller_seen = 1 WHERE seller_id = ? AND seller_seen = 0').bind(auth.seller.id).run();
  return json({ ok: true });
}
