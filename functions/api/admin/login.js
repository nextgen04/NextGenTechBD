// POST /api/admin/login — { key } অ্যাডমিন কী/পাসওয়ার্ড যাচাই করে একটা মেয়াদি সেশন টোকেন দেয়
// • রিসেটের আগে: পাসওয়ার্ড = Cloudflare-এ সেট করা ADMIN_KEY
// • ইমেইলে রিসেট করার পর: পাসওয়ার্ড = DB-তে হ্যাশ করা নতুন পাসওয়ার্ড (তখন ADMIN_KEY আর কাজ করে না)
// • একই IP থেকে ১৫ মিনিটে ৫ বার ভুল হলে সাময়িক লক
import { json, err, logAdminLogin, safeEqual, verifyPassword, sha256Hex, newSecretToken, futureIso } from '../../_lib/utils.js';

const MAX_FAILS = 5;
const SESSION_HOURS = 12;

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    let body;
    try { body = await request.json(); } catch (e) { return err('অনুরোধ সঠিক নয়', 400); }
    const key = body && typeof body.key === 'string' ? body.key : '';
    const ip = request.headers.get('CF-Connecting-Ip') || request.headers.get('CF-Connecting-IP') || '';

    const fails = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM admin_login_log WHERE success = 0 AND ip = ? AND created_at > datetime('now', '-15 minutes')"
    ).bind(ip).first();
    if (fails && fails.n >= MAX_FAILS) {
      return err('অনেকবার ভুল চেষ্টা হয়েছে — ১৫ মিনিট পর আবার চেষ্টা করুন', 429);
    }

    const cred = await env.DB.prepare('SELECT password_hash, password_salt FROM admin_credentials WHERE id = 1').first();
    let ok = false;
    if (cred) {
      ok = !!key && (await verifyPassword(key, cred.password_salt, cred.password_hash));
    } else {
      if (!env.ADMIN_KEY) {
        return err('সার্ভারে ADMIN_KEY সেট করা হয়নি — Cloudflare Pages → Settings → Environment variables এ যোগ করুন', 500);
      }
      ok = !!key && (await safeEqual(key, env.ADMIN_KEY));
    }

    if (!ok) {
      await logAdminLogin(env, false, request);
      return err('ভুল অ্যাডমিন কী/পাসওয়ার্ড', 401);
    }

    await logAdminLogin(env, true, request);
    const token = newSecretToken();
    await env.DB.prepare('INSERT INTO admin_sessions (token_hash, expires_at, ip) VALUES (?, ?, ?)')
      .bind(await sha256Hex(token), futureIso(SESSION_HOURS * 60), ip)
      .run();
    await env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').bind(new Date().toISOString()).run();

    return json({ ok: true, token, expires_in_hours: SESSION_HOURS });
  } catch (e) {
    console.error('admin login failed:', e && e.message);
    return err('লগইন করা যায়নি — সার্ভারে সমস্যা হয়েছে', 500);
  }
}
