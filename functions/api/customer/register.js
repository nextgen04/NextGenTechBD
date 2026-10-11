// POST /api/customer/register — নতুন গ্রাহক অ্যাকাউন্ট তৈরি
import { json, err, createPasswordRecord, newSessionToken, sessionExpiryDate } from '../../_lib/utils.js';

const PHONE_RE = /^01[3-9]\d{8}$/;

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { name, phone, email, password } = await request.json();
    if (!name || !name.trim()) return err('নাম দিন', 400);
    if (!phone || !PHONE_RE.test(phone.trim())) return err('সঠিক মোবাইল নম্বর দিন (যেমন 017XXXXXXXX)', 400);
    if (!password || password.length < 6) return err('পাসওয়ার্ড কমপক্ষে ৬ ক্যারেক্টার হতে হবে', 400);

    const existing = await env.DB.prepare('SELECT id FROM customers WHERE phone = ?').bind(phone.trim()).first();
    if (existing) return err('এই মোবাইল নম্বর দিয়ে আগে থেকেই একটা অ্যাকাউন্ট আছে — লগইন করুন', 400);

    const { salt, hash } = await createPasswordRecord(password);
    const res = await env.DB.prepare(
      'INSERT INTO customers (name, phone, email, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)'
    )
      .bind(name.trim(), phone.trim(), email ? email.trim() : null, hash, salt)
      .run();

    const customerId = res.meta.last_row_id;
    const token = newSessionToken();
    const expiresAt = sessionExpiryDate();
    await env.DB.prepare('INSERT INTO customer_sessions (token, customer_id, expires_at) VALUES (?, ?, ?)')
      .bind(token, customerId, expiresAt)
      .run();

    return json({ ok: true, token, customer: { id: customerId, name: name.trim(), phone: phone.trim(), email: email || null } });
  } catch (e) {
    return err('অ্যাকাউন্ট তৈরি করা যায়নি: ' + e.message, 500);
  }
}
