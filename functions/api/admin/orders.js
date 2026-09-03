// /api/admin/orders — অ্যাডমিন প্যানেলে অর্ডারের তালিকা দেখা ও স্ট্যাটাস বদলানো (X-Admin-Key হেডার লাগবে)
// GET   → সব অর্ডারের তালিকা (নতুন আগে)
// PATCH → { id, status } দিয়ে অর্ডারের স্ট্যাটাস বদলানো
import { json, err, requireAdmin } from '../../_lib/utils.js';

const VALID_STATUS = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  try {
    const res = await env.DB.prepare(
      'SELECT id, order_no, name, phone, address, district, payment, note, items, subtotal, delivery_fee, total, status, created_at FROM orders ORDER BY id DESC LIMIT 200'
    ).all();
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
    const { id, status } = await request.json();
    if (!id || !VALID_STATUS.includes(status)) return err('সঠিক id ও status দিন', 400);
    await env.DB.prepare('UPDATE orders SET status = ? WHERE id = ?').bind(status, Number(id)).run();
    return json({ ok: true });
  } catch (e) {
    return err('স্ট্যাটাস আপডেট করা যায়নি: ' + e.message, 500);
  }
}
