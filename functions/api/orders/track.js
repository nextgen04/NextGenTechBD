// GET /api/orders/track?orderNo=SB12345678&phone=017XXXXXXXX
// পাবলিক অর্ডার ট্র্যাকিং — লগইন ছাড়াই অর্ডার আইডি + মোবাইল নম্বর দিয়ে অর্ডার খোঁজা যায়
// (নিরাপত্তার জন্য দুটোই মিলতে হবে, শুধু অর্ডার আইডি দিয়ে অন্যের অর্ডার দেখা যাবে না)
import { json, err } from '../../_lib/utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;
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

    // মাল্টি-সেলার: কোন সেলারের পার্সেল এখন কী অবস্থায় (পুরনো অর্ডারে খালি)। সেলারের ব্যক্তিগত তথ্য নয় — শুধু স্টোরের নাম।
    let shipments = [];
    try {
      const ord = await env.DB.prepare('SELECT id FROM orders WHERE order_no = ? AND phone = ?').bind(orderNo, phone).first();
      const its = await env.DB.prepare(
        `SELECT oi.seller_id, s.store_name, oi.product_name_snapshot AS name, oi.quantity, oi.seller_status AS status, oi.courier, oi.tracking_id
         FROM order_items oi LEFT JOIN sellers s ON s.id = oi.seller_id WHERE oi.order_id = ? ORDER BY oi.id`
      ).bind(ord.id).all();
      const map = new Map();
      for (const it of its.results || []) {
        if (!map.has(it.seller_id)) map.set(it.seller_id, { store: it.store_name, status: it.status, courier: it.courier, tracking_id: it.tracking_id, items: [] });
        const g = map.get(it.seller_id); g.items.push({ name: it.name, quantity: it.quantity, status: it.status });
        if (it.status !== g.status) g.status = 'mixed';
      }
      shipments = [...map.values()];
    } catch (e) { /* পুরনো স্কিমা */ }

    return json({ order: { ...row, items, shipments } });
  } catch (e) {
    return err('অর্ডার খোঁজা যায়নি: ' + e.message, 500);
  }
}
