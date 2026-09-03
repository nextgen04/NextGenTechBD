// POST /api/orders — কাস্টমার চেকআউট করলে অর্ডারটি D1 ডেটাবেজে সংরক্ষণ হয়
// (হোয়াটসঅ্যাপ মেসেজ ফ্রন্টএন্ড থেকে আগের মতোই পাঠানো হয়, এটা শুধু ব্যাকআপ/অ্যাডমিন রেকর্ড হিসেবে থাকে)
// গ্রাহক লগইন করা থাকলে (X-Session-Token হেডার থাকলে) অর্ডারটি তার অ্যাকাউন্টের সাথে যুক্ত হয়ে যায়,
// যাতে সে পরে "আমার অর্ডার হিস্টোরি"তে এটা দেখতে পায়। লগইন না থাকলেও (গেস্ট চেকআউট) অর্ডার আইডি +
// মোবাইল নম্বর দিয়ে /orders পেজ থেকে ট্র্যাক করা যাবে।
import { json, err, getCustomerFromRequest } from '../_lib/utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const { orderNo, name, phone, address, district, payment, note, items, subtotal, deliveryFee, total } = body || {};

    if (!orderNo || !name || !phone || !address || !items || total === undefined) {
      return err('অর্ডারের প্রয়োজনীয় তথ্য অনুপস্থিত', 400);
    }

    const customer = await getCustomerFromRequest(request, env);

    await env.DB.prepare(
      `INSERT INTO orders (order_no, customer_id, name, phone, address, district, payment, note, items, subtotal, delivery_fee, total, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
    )
      .bind(
        String(orderNo),
        customer ? customer.id : null,
        String(name),
        String(phone),
        String(address),
        district ? String(district) : null,
        payment ? String(payment) : null,
        note ? String(note) : null,
        typeof items === 'string' ? items : JSON.stringify(items),
        Number(subtotal) || 0,
        Number(deliveryFee) || 0,
        Number(total) || 0
      )
      .run();

    return json({ ok: true, orderNo });
  } catch (e) {
    // অর্ডার সেভ ব্যর্থ হলেও কাস্টমারের চেকআউট আটকানো ঠিক না (হোয়াটসঅ্যাপে অর্ডারটি চলে যাবে) —
    // তাই ফ্রন্টএন্ড এই এরর হলেও চেকআউট সম্পন্ন দেখাবে।
    return err('অর্ডার সংরক্ষণ করা যায়নি: ' + e.message, 500);
  }
}
