// POST /api/seller/login — { email, password } → মেয়াদি সেশন টোকেন (X-Seller-Token হেডারে ব্যবহার হয়)
// 🔒 IP ও ইমেইল — দুই দিক থেকেই rate limit; ভুল ইমেইল/পাসওয়ার্ডে একই বার্তা (কোন ইমেইল নিবন্ধিত তা বোঝা যায় না)
import { json, err, verifyPassword, sha256Hex, newSecretToken, futureIso, normalizeEmail } from '../../_lib/utils.js';
import { rateLimit } from '../../_lib/ratelimit.js';
import { publicSeller, SELLER_SESSION_HOURS } from '../../_lib/seller.js';

const DUMMY_SALT = '00000000000000000000000000000000';
const DUMMY_HASH = '0'.repeat(64);

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    let body;
    try { body = await request.json(); } catch (e) { return err('অনুরোধ সঠিক নয়', 400); }
    const email = normalizeEmail(body && body.email);
    const password = body && typeof body.password === 'string' ? body.password : '';
    if (!email || !password || password.length > 200) return err('ইমেইল ও পাসওয়ার্ড দিন', 400);

    const l1 = await rateLimit(env, request, 'seller-login', 10, 15 * 60);
    if (l1) return l1;
    const l2 = await rateLimit(env, request, 'seller-login-email', 30, 60 * 60, email, false);
    if (l2) return l2;

    const s = await env.DB.prepare('SELECT * FROM sellers WHERE lower(email) = ?').bind(email).first();
    // Seller না পেলেও একই পরিমাণ হিসাব চালানো হয় (সময় দেখে ইমেইল চেনা আটকাতে)
    const ok = await verifyPassword(password, s ? s.password_salt : DUMMY_SALT, s ? s.password_hash : DUMMY_HASH);
    if (!s || !ok) return err('ভুল ইমেইল অথবা পাসওয়ার্ড', 401);
    if (s.status !== 'active') return err('আপনার Seller অ্যাকাউন্ট বর্তমানে বন্ধ আছে — Super Admin-এর সাথে যোগাযোগ করুন', 403);

    const token = newSecretToken();
    const ip = request.headers.get('CF-Connecting-IP') || '';
    await env.DB.prepare('INSERT INTO seller_sessions (token_hash, seller_id, expires_at, ip) VALUES (?, ?, ?, ?)')
      .bind(await sha256Hex(token), s.id, futureIso(SELLER_SESSION_HOURS * 60), ip).run();
    await env.DB.prepare('DELETE FROM seller_sessions WHERE expires_at < ?').bind(new Date().toISOString()).run();

    return json({ ok: true, token, expires_in_hours: SELLER_SESSION_HOURS, seller: publicSeller(s) });
  } catch (e) {
    console.error('seller login failed:', e && e.message);
    return err('লগইন করা যায়নি — সার্ভারে সমস্যা হয়েছে', 500);
  }
}
