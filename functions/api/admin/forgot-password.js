// POST /api/admin/forgot-password — অ্যাডমিন পাসওয়ার্ড ভুলে গেলে রিসেট লিংক অ্যাডমিন ইমেইলে (ডিফল্ট tnextgen04@gmail.com, ADMIN_EMAIL env দিয়ে বদলানো যায়) পাঠায়
// • কোনো লগইন/ইনপুট লাগে না, লিংক সবসময় শুধু নির্ধারিত অ্যাডমিন ইমেইলেই যায়
// • ঘণ্টায় সর্বোচ্চ ৩টা রিকোয়েস্ট (ইমেইল স্প্যাম ঠেকাতে)
// • কাজটা ব্যাকগ্রাউন্ডে হয়, তাই রেসপন্স সবসময় একই
import { json, adminEmail, newSecretToken, sha256Hex, siteUrl, futureIso, RESET_TOKEN_MINUTES } from '../../_lib/utils.js';
import { sendEmail, adminResetEmail } from '../../_lib/email.js';
import { rateLimit } from '../../_lib/ratelimit.js';

const MAX_PER_HOUR = 3;

export async function onRequestPost(context) {
  const { request, env } = context;
  const limited = await rateLimit(env, request, 'admin-forgot', 5, 60 * 60);
  if (limited) return limited;
  const base = siteUrl(request, env);
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const userAgent = request.headers.get('User-Agent') || '';

  const work = (async () => {
    try {
      const hourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
      const recent = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM password_resets WHERE kind = 'admin' AND created_at > ?"
      ).bind(hourAgo).first();
      if (recent && recent.n >= MAX_PER_HOUR) return;

      const token = newSecretToken();
      await env.DB.prepare('INSERT INTO password_resets (token_hash, kind, customer_id, expires_at, created_at) VALUES (?, ?, NULL, ?, ?)')
        .bind(await sha256Hex(token), 'admin', futureIso(RESET_TOKEN_MINUTES), new Date().toISOString())
        .run();
      // এক দিনের বেশি পুরনো টোকেন মুছে ফেলা
      await env.DB.prepare('DELETE FROM password_resets WHERE expires_at < ?')
        .bind(new Date(Date.now() - 24 * 3600 * 1000).toISOString()).run();

      const link = `${base}/admin/?reset=${token}`;
      await sendEmail(env, { to: adminEmail(env), ...adminResetEmail({ link, minutes: RESET_TOKEN_MINUTES, ip, userAgent }) });
    } catch (e) {
      console.error('admin forgot-password failed:', e && e.message);
    }
  })();

  if (context.waitUntil) context.waitUntil(work); else await work;
  return json({ ok: true, message: 'রিসেট লিংক অ্যাডমিনের নিবন্ধিত ইমেইলে পাঠানো হয়েছে (যদি ইমেইল সার্ভিস চালু থাকে)। ইনবক্স ও স্প্যাম ফোল্ডার দেখুন — লিংকটি ' + RESET_TOKEN_MINUTES + ' মিনিট কাজ করবে।' });
}
