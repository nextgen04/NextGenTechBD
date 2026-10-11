// POST /api/admin/login — { key } সঠিক কিনা যাচাই করে; সফল হলে HttpOnly ADMIN_SESSION cookie-ও সেট করে
// (আগের ফ্রন্টএন্ড X-Admin-Key হেডার দিয়ে চললেও সব ঠিকই কাজ করবে — এটা backward-compatible)
// প্রতিটা চেষ্টা লগ হয়; একই IP থেকে ১৫ মিনিটে ১০ বার ভুল হলে সাময়িক ব্লক।
import { json, err, logAdminLogin } from '../../_lib/utils.js';
import { timingSafeEqualStr, createAdminSession, getClientIp, checkSameOrigin, withCookies } from '../../_lib/auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!checkSameOrigin(request)) return err('অনুমোদিত নয় (cross-site রিকোয়েস্ট)', 403);
  try {
    const { key } = await request.json();
    if (!env.ADMIN_KEY) {
      return err('সার্ভারে ADMIN_KEY সেট করা হয়নি — Cloudflare Pages → Settings → Environment variables এ যোগ করুন', 500);
    }
    const ip = getClientIp(request);
    if (ip) {
      try {
        const f = await env.DB.prepare(
          `SELECT COUNT(*) AS c FROM admin_login_log WHERE ip = ? AND success = 0 AND created_at >= datetime('now','-15 minutes')`
        ).bind(ip).first();
        if (f && f.c >= 10) return err('অনেকবার ভুল চেষ্টা হয়েছে — ১৫ মিনিট পর আবার চেষ্টা করুন', 429);
      } catch (e) { /* লগ টেবিল না থাকলে এড়িয়ে যাওয়া */ }
    }
    if (!key || !timingSafeEqualStr(key, env.ADMIN_KEY)) {
      await logAdminLogin(env, false, request);
      return err('ভুল অ্যাডমিন কী', 401);
    }
    await logAdminLogin(env, true, request);
    const session = await createAdminSession(env, request);
    return withCookies(json({ ok: true, role: 'SUPER_ADMIN', session: !!session }), session ? [session.cookie] : []);
  } catch (e) {
    return err('লগইন ব্যর্থ হয়েছে: ' + e.message, 400);
  }
}
