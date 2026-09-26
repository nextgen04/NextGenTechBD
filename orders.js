// GET /api/customer/orders — লগইন করা গ্রাহকের সব অর্ডারের হিস্টোরি (আইডি সহ)
import { json, err, getCustomerFromRequest } from '../../_lib/utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const customer = await getCustomerFromRequest(request, env);
  if (!customer) return err('লগইন করা প্রয়োজন', 401);

  try {
    const res = await env.DB.prepare(
      `SELECT order_no, name, phone, address, district, payment, items, subtotal, delivery_fee, total, status, created_at
       FROM orders WHERE customer_id = ? ORDER BY id DESC LIMIT 100`
    )
      .bind(customer.id)
      .all();

    const orders = (res.results || []).map((o) => {
      let items = [];
      try { items = JSON.parse(o.items); } catch (e) { items = o.items; }
      return { ...o, items };
    });

    return json({ orders });
  } catch (e) {
    return err('অর্ডার হিস্টোরি লোড করা যায়নি: ' + e.message, 500);
  }
}
