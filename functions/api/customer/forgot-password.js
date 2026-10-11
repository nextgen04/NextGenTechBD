// POST /api/customer/forgot-password — { email }
// অ্যাকাউন্টের ইমেইলে একটা রিসেট লিংক পাঠায় (৩০ মিনিটের মেয়াদ, একবার ব্যবহারযোগ্য)।
// ইমেইল অ্যাকাউন্টে আছে কিনা বাইরে থেকে বোঝা যায় না — রেসপন্স সবসময় একই, কাজ ব্যাকগ্রাউন্ডে হয়।
// একই অ্যাকাউন্টে ঘণ্টায় সর্বোচ্চ ৩টা রিসেট ইমেইল পাঠানো হয়।
import { json, err, EMAIL_RE, normalizeEmail, newSecretToken, sha256Hex, siteUrl, futureIso, RESET_TOKEN_MINUTES } from '../../_lib/utils.js';
import { sendEmail, customerResetEmail } from '../../_lib/email.js';
import { rateLimit } from '../../_lib/ratelimit.js';

const MAX_PER_HOUR = 3;

export async function onRequestPost(context) {
  const { request, env } = context;
  const limited = await rateLimit(env, request, 'cust-forgot', 5, 60 * 60);
  if (limited) return limited;
  let body;
  try { body = await request.json(); } catch (e) { return err('অনুরোধ সঠিক নয়', 400); }
  const email = normalizeEmail(body && body.email);
  if (!EMAIL_RE.test(email) || email.length > 200) return err('সঠিক ইমেইল ঠিকানা দিন', 400);

  const base = siteUrl(request, env);
  const work = (async () => {
    try {
      const c = await env.DB.prepare(
        'SELECT id, name, email FROM customers WHERE lower(email) = ? AND COALESCE(blocked, 0) = 0 ORDER BY id DESC LIMIT 1'
      ).bind(email).first();
      if (!c) return;

      const hourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
      const recent = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM password_resets WHERE kind = 'customer' AND customer_id = ? AND created_at > ?"
      ).bind(c.id, hourAgo).first();
      if (recent && recent.n >= MAX_PER_HOUR) return;

      const token = newSecretToken();
      await env.DB.prepare('INSERT INTO password_resets (token_hash, kind, customer_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(await sha256Hex(token), 'customer', c.id, futureIso(RESET_TOKEN_MINUTES), new Date().toISOString())
        .run();
      await env.DB.prepare('DELETE FROM password_resets WHERE expires_at < ?')
        .bind(new Date(Date.now() - 24 * 3600 * 1000).toISOString()).run();

      const link = `${base}/orders/?reset=${token}`;
      await sendEmail(env, { to: c.email, ...customerResetEmail({ name: c.name, link, minutes: RESET_TOKEN_MINUTES }) });
    } catch (e) {
      console.error('customer forgot-password failed:', e && e.message);
    }
  })();

  if (context.waitUntil) context.waitUntil(work); else await work;
  return json({ ok: true, message: 'এই ইমেইলে অ্যাকাউন্ট থাকলে একটা রিসেট লিংক পাঠানো হয়েছে। ইনবক্স ও স্প্যাম ফোল্ডার দেখুন — লিংকটি ' + RESET_TOKEN_MINUTES + ' মিনিট কাজ করবে।' });
}
