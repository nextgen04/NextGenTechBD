// POST /api/admin/reset-password — { token, password } ইমেইলের লিংকের টোকেন দিয়ে নতুন অ্যাডমিন পাসওয়ার্ড সেট
// টোকেন একবারই কাজ করে; সফল হলে সব অ্যাডমিন সেশন বাতিল হয় এবং নিশ্চিতকরণ ইমেইল যায়
import { json, err, adminEmail, createPasswordRecord, sha256Hex, TOKEN_RE } from '../../_lib/utils.js';
import { sendEmail, passwordChangedEmail } from '../../_lib/email.js';
import { rateLimit } from '../../_lib/ratelimit.js';

const MIN_LEN = 10;

export async function onRequestPost(context) {
  const { request, env } = context;
  const limited = await rateLimit(env, request, 'admin-reset', 10, 60 * 60);
  if (limited) return limited;
  try {
    let body;
    try { body = await request.json(); } catch (e) { return err('অনুরোধ সঠিক নয়', 400); }
    const { token, password } = body || {};

    if (typeof token !== 'string' || !TOKEN_RE.test(token)) {
      return err('রিসেট লিংকটি সঠিক নয় অথবা মেয়াদ শেষ — আবার "পাসওয়ার্ড ভুলে গেছেন?" থেকে নতুন লিংক নিন', 400);
    }
    if (typeof password !== 'string' || password.length < MIN_LEN) {
      return err(`অ্যাডমিন পাসওয়ার্ড কমপক্ষে ${MIN_LEN} ক্যারেক্টার হতে হবে`, 400);
    }

    // টোকেন একবারেই "দাবি" করা হয় (DELETE ... RETURNING) — একই টোকেন দুবার ব্যবহার করা যাবে না
    const claimed = await env.DB.prepare(
      "DELETE FROM password_resets WHERE token_hash = ? AND kind = 'admin' AND expires_at > ? RETURNING token_hash"
    ).bind(await sha256Hex(token), new Date().toISOString()).first();
    if (!claimed) {
      return err('রিসেট লিংকটি সঠিক নয় অথবা মেয়াদ শেষ — আবার "পাসওয়ার্ড ভুলে গেছেন?" থেকে নতুন লিংক নিন', 400);
    }

    const { salt, hash } = await createPasswordRecord(password);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO admin_credentials (id, password_hash, password_salt, updated_at) VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash, password_salt = excluded.password_salt, updated_at = excluded.updated_at`
      ).bind(hash, salt, new Date().toISOString()),
      env.DB.prepare('DELETE FROM admin_sessions'),
      env.DB.prepare("DELETE FROM password_resets WHERE kind = 'admin'"),
    ]);

    const notify = sendEmail(env, { to: adminEmail(env), ...passwordChangedEmail({ isAdmin: true }) })
      .catch((e) => console.error('admin password-changed email failed:', e && e.message));
    if (context.waitUntil) context.waitUntil(notify);

    return json({ ok: true, message: 'অ্যাডমিন পাসওয়ার্ড সফলভাবে বদলানো হয়েছে — এখন নতুন পাসওয়ার্ড দিয়ে লগইন করুন' });
  } catch (e) {
    console.error('admin reset-password failed:', e && e.message);
    return err('পাসওয়ার্ড রিসেট করা যায়নি — সার্ভারে সমস্যা হয়েছে', 500);
  }
}
