// POST /api/customer/login — মোবাইল নম্বর ও পাসওয়ার্ড দিয়ে গ্রাহক লগইন
import { json, err, verifyPassword, newSessionToken, sessionExpiryDate } from '../../_lib/utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { phone, password } = await request.json();
    if (!phone || !password) return err('মোবাইল নম্বর ও পাসওয়ার্ড দিন', 400);

    const row = await env.DB.prepare(
      'SELECT id, name, phone, email, password_hash, password_salt FROM customers WHERE phone = ?'
    )
      .bind(phone.trim())
      .first();

    if (!row) return err('এই নম্বরে কোনো অ্যাকাউন্ট পাওয়া যায়নি', 401);

    const ok = await verifyPassword(password, row.password_salt, row.password_hash);
    if (!ok) return err('ভুল পাসওয়ার্ড', 401);

    const token = newSessionToken();
    const expiresAt = sessionExpiryDate();
    await env.DB.prepare('INSERT INTO customer_sessions (token, customer_id, expires_at) VALUES (?, ?, ?)')
      .bind(token, row.id, expiresAt)
      .run();

    return json({ ok: true, token, customer: { id: row.id, name: row.name, phone: row.phone, email: row.email } });
  } catch (e) {
    return err('লগইন করা যায়নি: ' + e.message, 500);
  }
}
