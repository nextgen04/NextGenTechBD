// GET   /api/seller/orders/:id — অর্ডারের (orders.id) শুধু এই সেলারের আইটেম; অন্য সেলারের অর্ডার হলে 404
// PATCH /api/seller/orders/:id — { status, item_ids?, courier?, tracking_id?, note? } নিজের আইটেমের স্ট্যাটাস আপডেট
// Super Admin যেকোনো আইটেমের স্ট্যাটাস override করতে পারে (Phase 7-এ admin API)
import { json, err, ORDER_STATUSES } from '../../../_lib/utils.js';
import { requireSeller } from '../../../_lib/auth.js';
import { parseId, cleanText } from '../../../_lib/sellers.js';
import { ORDER_ITEM_SELECT, groupOrders } from './index.js';
import { itemStatusSideEffects, syncOrderStatus } from '../../../_lib/order-status.js';

// সেলার যে পরিবর্তনগুলো করতে পারে — cancelled/returned চূড়ান্ত; delivered থেকে শুধু returned
const NEXT = {
  pending: ['processing', 'confirmed', 'shipped', 'delivered', 'cancelled'],
  processing: ['confirmed', 'shipped', 'delivered', 'cancelled'],
  confirmed: ['processing', 'shipped', 'delivered', 'cancelled'],
  shipped: ['delivered', 'returned', 'cancelled'],
  delivered: ['returned'],
  cancelled: [], returned: [],
};

async function load(env, orderId, sellerId) {
  const res = await env.DB.prepare(`SELECT ${ORDER_ITEM_SELECT} FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.order_id = ? AND oi.seller_id = ? ORDER BY oi.id`).bind(orderId, sellerId).all();
  return res.results || [];
}

export async function onRequestGet({ request, env, params }) {
  const auth = await requireSeller(request, env, { permission: 'orders:read' });
  if (auth.response) return auth.response;
  const id = parseId(params.id); const rows = id ? await load(env, id, auth.seller.id) : [];
  if (!rows.length) return err('অর্ডার পাওয়া যায়নি', 404);
  await env.DB.prepare('UPDATE order_items SET seller_seen = 1 WHERE order_id = ? AND seller_id = ?').bind(id, auth.seller.id).run();
  const hist = await env.DB.prepare(`SELECT h.status, h.note, h.changed_by, h.created_at, h.order_item_id FROM order_item_status_history h
    JOIN order_items oi ON oi.id = h.order_item_id WHERE oi.order_id = ? AND oi.seller_id = ? ORDER BY h.id DESC LIMIT 50`).bind(id, auth.seller.id).all();
  return json({ order: groupOrders(rows)[0], history: hist.results || [] });
}

export async function onRequestPatch({ request, env, params }) {
  const auth = await requireSeller(request, env, { permission: 'orders:write' });
  if (auth.response) return auth.response;
  const id = parseId(params.id);
  let b; try { b = await request.json(); } catch (e) { return err('অবৈধ রিকোয়েস্ট', 400); }
  b = b || {};
  const rows = id ? await load(env, id, auth.seller.id) : [];
  if (!rows.length) return err('অর্ডার পাওয়া যায়নি', 404);
  if (b.status !== undefined && !ORDER_STATUSES.includes(b.status)) return err('স্ট্যাটাস সঠিক নয়', 400);

  let targets = rows;                                      // শুধু এই সেলারের আইটেম থেকেই বাছাই — অন্যের item_id পাঠালে উপেক্ষিত
  if (Array.isArray(b.item_ids) && b.item_ids.length) {
    const want = new Set(b.item_ids.map(Number));
    targets = rows.filter((r) => want.has(r.item_id));
    if (!targets.length) return err('আইটেম পাওয়া যায়নি', 404);
  }
  const note = cleanText(b.note, 300) || null;
  const courier = b.courier !== undefined ? cleanText(b.courier, 60) || null : undefined;
  const tracking = b.tracking_id !== undefined ? cleanText(b.tracking_id, 80) || null : undefined;
  if ((courier || tracking || '').includes('<') || /[<>]/.test((courier || '') + (tracking || '') + (note || ''))) return err('< বা > চিহ্ন ব্যবহার করা যাবে না', 400);

  const stmts = [];
  for (const t of targets) {
    if (b.status && b.status !== t.status) {
      if (!NEXT[t.status].includes(b.status)) return err(`"${t.product}" এর স্ট্যাটাস ${t.status} থেকে ${b.status} করা যাবে না — Super Admin-এর সাথে যোগাযোগ করুন`, 409);
      // ইতিহাস + (বাতিলে) স্টক ফেরত — একই ব্যাচে, সব-অথবা-কিছুই-না
      stmts.push(...(await itemStatusSideEffects(env, { id: t.item_id, product_id: t.product_id, quantity: t.quantity, seller_id: auth.seller.id, from: t.status }, b.status, 'seller:' + auth.seller.id, note)));
    }
    const sets = []; const args = [];
    if (b.status && b.status !== t.status) { sets.push('seller_status = ?'); args.push(b.status); }
    if (courier !== undefined) { sets.push('courier = ?'); args.push(courier); }
    if (tracking !== undefined) { sets.push('tracking_id = ?'); args.push(tracking); }
    if (!sets.length) continue;
    stmts.push(env.DB.prepare(`UPDATE order_items SET ${sets.join(', ')}, seller_seen = 1, updated_at = datetime('now') WHERE id = ? AND seller_id = ? AND order_id = ?`).bind(...args, t.item_id, auth.seller.id, id));
  }
  if (!stmts.length) return json({ ok: true, unchanged: true });
  await env.DB.batch(stmts);
  if (b.status) await syncOrderStatus(env, id, 'seller:' + auth.seller.id);   // গ্রাহকের দেখা মূল অর্ডারের অবস্থা হালনাগাদ
  return json({ ok: true, order: groupOrders(await load(env, id, auth.seller.id))[0] });
}
