// POST /api/customer/register — নতুন গ্রাহক অ্যাকাউন্ট তৈরি (ইমেইল বাধ্যতামূলক — পাসওয়ার্ড রিসেট লিংক এই ইমেইলেই যাবে)
import { json, err, createPasswordRecord, newSessionToken, sessionExpiryDate, EMAIL_RE, normalizeEmail, sha256Hex } from '../../_lib/utils.js';
import { rateLimit } from '../../_lib/ratelimit.js';

const PHONE_RE = /^01[3-9]\d{8}$/;
const MIN_LEN = 8;

export async function onRequestPost(context) {
  const { request, env } = context;
  const limited = await rateLimit(env, request, 'register', 5, 60 * 60);
  if (limited) return limited;
  try {
    let body;
    try { body = await request.json(); } catch (e) { return err('অনুরোধ সঠিক নয়', 400); }
    const { name, phone, password } = body || {};
    const email = normalizeEmail(body && body.email);

    if (!name || typeof name !== 'string' || !name.trim() || name.length > 100) return err('নাম দিন', 400);
    if (!phone || typeof phone !== 'string' || !PHONE_RE.test(phone.trim())) return err('সঠিক মোবাইল নম্বর দিন (যেমন 017XXXXXXXX)', 400);
    if (!EMAIL_RE.test(email) || email.length > 200) return err('সঠিক ইমেইল ঠিকানা দিন — পাসওয়ার্ড ভুলে গেলে এই ইমেইলে রিসেট লিংক যাবে', 400);
    if (!password || typeof password !== 'string' || password.length < MIN_LEN) return err(`পাসওয়ার্ড কমপক্ষে ${MIN_LEN} ক্যারেক্টার হতে হবে`, 400);

    const existing = await env.DB.prepare('SELECT id FROM customers WHERE phone = ?').bind(phone.trim()).first();
    if (existing) return err('এই মোবাইল নম্বর দিয়ে আগে থেকেই একটা অ্যাকাউন্ট আছে — লগইন করুন', 400);
    const emailTaken = await env.DB.prepare('SELECT id FROM customers WHERE lower(email) = ?').bind(email).first();
    if (emailTaken) return err('এই ইমেইল দিয়ে আগে থেকেই একটা অ্যাকাউন্ট আছে — লগইন করুন', 400);

    const { salt, hash } = await createPasswordRecord(password);
    const res = await env.DB.prepare(
      'INSERT INTO customers (name, phone, email, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)'
    )
      .bind(name.trim(), phone.trim(), email, hash, salt)
      .run();

    const customerId = res.meta.last_row_id;
    const token = newSessionToken();
    const expiresAt = sessionExpiryDate();
    await env.DB.prepare('INSERT INTO customer_sessions (token, customer_id, expires_at) VALUES (?, ?, ?)')
      .bind(await sha256Hex(token), customerId, expiresAt)
      .run();

    return json({ ok: true, token, customer: { id: customerId, name: name.trim(), phone: phone.trim(), email } });
  } catch (e) {
    console.error('customer register failed:', e && e.message);
    return err('অ্যাকাউন্ট তৈরি করা যায়নি — একটু পরে আবার চেষ্টা করুন', 500);
  }
}
