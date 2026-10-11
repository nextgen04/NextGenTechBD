// POST /api/customer/reset-password — { token, password }
// ইমেইলে পাঠানো লিংকের টোকেন দিয়ে নতুন পাসওয়ার্ড সেট। টোকেন একবারই কাজ করে।
// সফল হলে ওই গ্রাহকের সব আগের লগইন সেশন ও বাকি রিসেট টোকেন বাতিল হয় এবং নিশ্চিতকরণ ইমেইল যায়।
import { json, err, createPasswordRecord, sha256Hex, TOKEN_RE } from '../../_lib/utils.js';
import { sendEmail, passwordChangedEmail } from '../../_lib/email.js';
import { rateLimit } from '../../_lib/ratelimit.js';

const MIN_LEN = 8;
const BAD_LINK = 'রিসেট লিংকটি সঠিক নয় অথবা মেয়াদ শেষ — আবার "পাসওয়ার্ড ভুলে গেছেন?" থেকে নতুন লিংক নিন';

export async function onRequestPost(context) {
  const { request, env } = context;
  const limited = await rateLimit(env, request, 'cust-reset', 10, 60 * 60);
  if (limited) return limited;
  try {
    let body;
    try { body = await request.json(); } catch (e) { return err('অনুরোধ সঠিক নয়', 400); }
    const { token, password } = body || {};

    if (typeof token !== 'string' || !TOKEN_RE.test(token)) return err(BAD_LINK, 400);
    if (typeof password !== 'string' || password.length < MIN_LEN) {
      return err(`পাসওয়ার্ড কমপক্ষে ${MIN_LEN} ক্যারেক্টার হতে হবে`, 400);
    }

    const claimed = await env.DB.prepare(
      "DELETE FROM password_resets WHERE token_hash = ? AND kind = 'customer' AND expires_at > ? RETURNING customer_id"
    ).bind(await sha256Hex(token), new Date().toISOString()).first();
    if (!claimed || !claimed.customer_id) return err(BAD_LINK, 400);

    const customerId = claimed.customer_id;
    const { salt, hash } = await createPasswordRecord(password);
    await env.DB.batch([
      env.DB.prepare('UPDATE customers SET password_hash = ?, password_salt = ? WHERE id = ?').bind(hash, salt, customerId),
      env.DB.prepare('DELETE FROM customer_sessions WHERE customer_id = ?').bind(customerId),
      env.DB.prepare("DELETE FROM password_resets WHERE kind = 'customer' AND customer_id = ?").bind(customerId),
    ]);

    const c = await env.DB.prepare('SELECT name, email FROM customers WHERE id = ?').bind(customerId).first();
    if (c && c.email) {
      const notify = sendEmail(env, { to: c.email, ...passwordChangedEmail({ name: c.name, isAdmin: false }) })
        .catch((e) => console.error('password-changed email failed:', e && e.message));
      if (context.waitUntil) context.waitUntil(notify);
    }

    return json({ ok: true, message: 'পাসওয়ার্ড সফলভাবে বদলানো হয়েছে — এখন নতুন পাসওয়ার্ড দিয়ে লগইন করুন' });
  } catch (e) {
    console.error('customer reset-password failed:', e && e.message);
    return err('পাসওয়ার্ড রিসেট করা যায়নি — সার্ভারে সমস্যা হয়েছে', 500);
  }
}
