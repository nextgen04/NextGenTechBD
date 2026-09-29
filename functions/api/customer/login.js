// POST /api/customer/login — মোবাইল নম্বর ও পাসওয়ার্ড দিয়ে গ্রাহক লগইন
// • ভুল নম্বর আর ভুল পাসওয়ার্ডে একই বার্তা (কোন নম্বরে অ্যাকাউন্ট আছে তা বাইরে থেকে বোঝা যায় না)
// • একই IP থেকে ১৫ মিনিটে ১৫ বার এবং একই নম্বরে ঘণ্টায় ৩০ বার চেষ্টার সীমা
import { json, err, hashPassword, verifyPassword, newSessionToken, sessionExpiryDate, sha256Hex } from '../../_lib/utils.js';
import { rateLimit } from '../../_lib/ratelimit.js';

const BAD_LOGIN = 'মোবাইল নম্বর অথবা পাসওয়ার্ড ভুল';

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    let body;
    try { body = await request.json(); } catch (e) { return err('অনুরোধ সঠিক নয়', 400); }
    const phone = body && typeof body.phone === 'string' ? body.phone.trim() : '';
    const password = body && typeof body.password === 'string' ? body.password : '';
    if (!phone || !password) return err('মোবাইল নম্বর ও পাসওয়ার্ড দিন', 400);

    const limited = (await rateLimit(env, request, 'login', 15, 15 * 60)) ||
                    (await rateLimit(env, request, 'login-phone', 30, 60 * 60, phone.slice(0, 20), false));
    if (limited) return limited;

    const row = await env.DB.prepare(
      'SELECT id, name, phone, email, password_hash, password_salt, blocked FROM customers WHERE phone = ?'
    ).bind(phone).first();

    if (!row) {
      await hashPassword(password, '00000000000000000000000000000000'); // সময় সমান রাখতে ডামি হ্যাশ
      return err(BAD_LOGIN, 401);
    }
    const ok = await verifyPassword(password, row.password_salt, row.password_hash);
    if (!ok) return err(BAD_LOGIN, 401);
    if (row.blocked) return err('এই অ্যাকাউন্টটি সাময়িকভাবে ব্লক করা আছে — বিস্তারিত জানতে দোকানের সাথে যোগাযোগ করুন', 403);

    const token = newSessionToken();
    await env.DB.prepare('INSERT INTO customer_sessions (token, customer_id, expires_at) VALUES (?, ?, ?)')
      .bind(await sha256Hex(token), row.id, sessionExpiryDate())
      .run();
    await env.DB.prepare('DELETE FROM customer_sessions WHERE expires_at < ?').bind(new Date().toISOString()).run();

    return json({ ok: true, token, customer: { id: row.id, name: row.name, phone: row.phone, email: row.email } });
  } catch (e) {
    console.error('customer login failed:', e && e.message);
    return err('লগইন করা যায়নি — একটু পরে আবার চেষ্টা করুন', 500);
  }
}
