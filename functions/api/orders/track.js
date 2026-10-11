// GET /api/orders/track?orderNo=SB12345678&phone=017XXXXXXXX
// পাবলিক অর্ডার ট্র্যাকিং — লগইন ছাড়াই অর্ডার আইডি + মোবাইল নম্বর দিয়ে অর্ডার খোঁজা যায়
// (নিরাপত্তার জন্য দুটোই মিলতে হবে, শুধু অর্ডার আইডি দিয়ে অন্যের অর্ডার দেখা যাবে না)
import { json, err } from '../../_lib/utils.js';
import { rateLimit } from '../../_lib/ratelimit.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const limited = await rateLimit(env, request, 'track', 20, 10 * 60);
  if (limited) return limited;
  try {
    const url = new URL(request.url);
    const orderNo = (url.searchParams.get('orderNo') || '').trim();
    const phone = (url.searchParams.get('phone') || '').trim();

    if (!orderNo || !phone) return err('অর্ডার আইডি ও মোবাইল নম্বর দিন', 400);

    const row = await env.DB.prepare(
      `SELECT order_no, name, phone, address, district, payment, note, items, subtotal, delivery_fee, total, status, created_at
       FROM orders WHERE order_no = ? AND phone = ?`
    )
      .bind(orderNo, phone)
      .first();

    if (!row) return err('এই তথ্য দিয়ে কোনো অর্ডার পাওয়া যায়নি — অর্ডার আইডি ও মোবাইল নম্বর মিলিয়ে দেখুন', 404);

    let items = [];
    try { items = JSON.parse(row.items); } catch (e) { items = row.items; }

    return json({ order: { ...row, items } });
  } catch (e) {
    console.error('orders/track failed:', e && e.message);
    return err('অর্ডার খোঁজা যায়নি', 500);
  }
}
