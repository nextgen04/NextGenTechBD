// /api/admin/order-items — Super Admin: নির্দিষ্ট সেলারের আইটেমের অবস্থা override (ট্রানজিশন-নিয়ম ছাড়াই)
// PATCH { order_id, seller_id?, item_ids?, status, note?, courier?, tracking_id? }
//   seller_id দিলে ওই সেলারের সব আইটেম; item_ids দিলে শুধু সেগুলো; দুটোই না দিলে অর্ডারের সব আইটেম।
// স্ট্যাটাস বদলালে ইতিহাস লেখা হয় (changed_by = super_admin), বাতিলে স্টক ফেরত, এবং গ্রাহকের দেখা মূল অর্ডারের অবস্থা সিঙ্ক হয়।
import { json, err, ORDER_STATUSES } from '../../_lib/utils.js';
import { requireAdmin } from '../../_lib/auth.js';
import { parseId, cleanText } from '../../_lib/sellers.js';
import { adminSetItemsStatus, syncOrderStatus } from '../../_lib/order-status.js';

export async function onRequestPatch({ request, env }) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  let b; try { b = await request.json(); } catch (e) { return err('অবৈধ রিকোয়েস্ট', 400); }
  b = b || {};
  const orderId = parseId(b.order_id);
  if (!orderId) return err('order_id আবশ্যক', 400);
  if (b.status !== undefined && !ORDER_STATUSES.includes(b.status)) return err('সঠিক status দিন', 400);
  const res = await env.DB.prepare('SELECT id, product_id, quantity, seller_id, seller_status FROM order_items WHERE order_id = ?').bind(orderId).all();
  let items = res.results || [];
  if (!items.length) return err('এই অর্ডারে সেলার-আইটেম নেই (পুরনো অর্ডার) — মূল অর্ডারের স্ট্যাটাস বদলান', 404);
  const sid = parseId(b.seller_id);
  if (sid) items = items.filter((i) => i.seller_id === sid);
  if (Array.isArray(b.item_ids) && b.item_ids.length) { const want = new Set(b.item_ids.map(Number)); items = items.filter((i) => want.has(i.id)); }
  if (!items.length) return err('আইটেম পাওয়া যায়নি', 404);

  let changed = 0;
  if (b.status === 'returned' && items.every((i) => i.seller_status === 'cancelled')) return err('বাতিল আইটেম "ফেরত" করা যায় না — আগে অন্য অবস্থায় আনুন', 409);
  if (b.status !== undefined) changed = await adminSetItemsStatus(env, items, b.status, cleanText(b.note, 300) || null);
  const courier = b.courier !== undefined ? cleanText(b.courier, 60) || null : undefined;
  const tracking = b.tracking_id !== undefined ? cleanText(b.tracking_id, 80) || null : undefined;
  if (/[<>]/.test((courier || '') + (tracking || ''))) return err('< বা > চিহ্ন ব্যবহার করা যাবে না', 400);
  if (courier !== undefined || tracking !== undefined) {
    const sets = [], args = [];
    if (courier !== undefined) { sets.push('courier = ?'); args.push(courier); }
    if (tracking !== undefined) { sets.push('tracking_id = ?'); args.push(tracking); }
    await env.DB.batch(items.map((i) => env.DB.prepare(`UPDATE order_items SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ? AND order_id = ?`).bind(...args, i.id, orderId)));
  }
  const orderStatus = await syncOrderStatus(env, orderId, 'super_admin');
  return json({ ok: true, changed, order_status: orderStatus });
}
