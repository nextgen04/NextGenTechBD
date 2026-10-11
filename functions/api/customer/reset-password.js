// POST /api/customer/reset-password — { phone, password }
// ফোন নম্বর যাচাই ধাপ পার হওয়ার পর গ্রাহক সরাসরি নতুন পাসওয়ার্ড সেট করে।
import { json, err, createPasswordRecord } from '../../_lib/utils.js';

const PHONE_RE = /^01[3-9]\d{8}$/;

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { phone, password } = await request.json();
    if (!phone || !PHONE_RE.test(phone.trim())) return err('সঠিক মোবাইল নম্বর দিন', 400);
    if (!password || password.length < 6) return err('পাসওয়ার্ড কমপক্ষে ৬ ক্যারেক্টার হতে হবে', 400);

    const customer = await env.DB.prepare('SELECT id FROM customers WHERE phone = ?').bind(phone.trim()).first();
    if (!customer) return err('এই নম্বরে কোনো অ্যাকাউন্ট পাওয়া যায়নি', 404);

    const { salt, hash } = await createPasswordRecord(password);
    await env.DB.batch([
      env.DB.prepare('UPDATE customers SET password_hash = ?, password_salt = ? WHERE id = ?').bind(hash, salt, customer.id),
      // নিরাপত্তার জন্য: পাসওয়ার্ড বদলালে আগের সব লগইন সেশন বাতিল হয়ে যাবে
      env.DB.prepare('DELETE FROM customer_sessions WHERE customer_id = ?').bind(customer.id),
    ]);

    return json({ ok: true, message: 'পাসওয়ার্ড সফলভাবে বদলানো হয়েছে — এখন নতুন পাসওয়ার্ড দিয়ে লগইন করুন' });
  } catch (e) {
    return err('পাসওয়ার্ড রিসেট করা যায়নি: ' + e.message, 500);
  }
}
