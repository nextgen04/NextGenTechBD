// POST /api/seller/login — { username, password }
// সিকিউরিটি: PBKDF2 পাসওয়ার্ড যাচাই, HttpOnly+SameSite=Strict সেশন cookie, ব্যর্থ লগইন সীমা (per-username ও per-IP),
// প্রতিটি চেষ্টা seller_login_log-এ রেকর্ড (success: 0=ব্যর্থ, 1=সফল, 2=অ্যাডমিন পাসওয়ার্ড রিসেট/আনলক মার্কার), ইউজারনেম আছে কি নেই — একই বার্তা ও একই সময় (enumeration ঠেকাতে)।
import { json, err, verifyPassword, hashPassword } from '../../_lib/utils.js';
import { checkSameOrigin, getClientIp, createSellerSession, withCookies, publicSeller, SELLER_PUBLIC_COLS, countRecentFailedLogins, logSellerLoginAttempt, MAX_FAILS_PER_USERNAME } from '../../_lib/auth.js';
import { getMarketplaceSettings, computeSubscription } from '../../_lib/subscription.js';

const MAX_FAILS_PER_IP = 20;        // ১৫ মিনিটে
const WINDOW = "-15 minutes";
const BAD_CREDS = 'ইউজারনেম বা পাসওয়ার্ড ভুল';

const logAttempt = logSellerLoginAttempt;

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!checkSameOrigin(request)) return err('অনুমোদিত নয় (cross-site রিকোয়েস্ট)', 403);

  let body;
  try { body = await request.json(); } catch (e) { return err('অবৈধ রিকোয়েস্ট', 400); }
  const username = String((body && body.username) || '').trim().toLowerCase();
  const password = String((body && body.password) || '');
  if (!username || !password) return err('ইউজারনেম ও পাসওয়ার্ড দিন', 400);
  if (username.length > 60 || password.length > 200) return err(BAD_CREDS, 401);

  try {
    // ব্যর্থ-লগইন সুরক্ষা — সফল লগইনের পর কাউন্টার নতুন করে শুরু হয়
    const ip = getClientIp(request);
    const userFails = { c: await countRecentFailedLogins(env, username) };
    const ipFails = ip
      ? await env.DB.prepare(`SELECT COUNT(*) AS c FROM seller_login_log WHERE ip = ? AND success = 0 AND created_at >= datetime('now', ?)`).bind(ip, WINDOW).first()
      : { c: 0 };
    if ((userFails && userFails.c >= MAX_FAILS_PER_USERNAME) || (ipFails && ipFails.c >= MAX_FAILS_PER_IP)) {
      return err('অনেকবার ভুল চেষ্টা হয়েছে — ১৫ মিনিট পর আবার চেষ্টা করুন', 429);
    }

    const row = await env.DB.prepare(
      `SELECT id, password_hash, password_salt, status, is_system, deleted_at, ${SELLER_PUBLIC_COLS.replace(/\bid,\s*/, '')} FROM sellers WHERE username = ?`
    ).bind(username).first();

    let ok = false;
    if (row && !row.is_system && !row.deleted_at) {
      ok = await verifyPassword(password, row.password_salt, row.password_hash);
    } else {
      await hashPassword(password, '00000000000000000000000000000000'); // সময় সমান রাখতে ডামি হ্যাশ
    }

    if (!ok) {
      await logAttempt(env, request, row && row.id, username, false);
      return err(BAD_CREDS, 401);
    }

    // পাসওয়ার্ড সঠিক — এবার অ্যাকাউন্টের অবস্থা
    if (row.status === 'blocked') {
      await logAttempt(env, request, row.id, username, false);
      return err('আপনার অ্যাকাউন্টটি ব্লক করা হয়েছে — মার্কেটপ্লেস অ্যাডমিনের সাথে যোগাযোগ করুন', 403);
    }
    if (row.status !== 'active') {
      await logAttempt(env, request, row.id, username, false);
      return err('আপনার অ্যাকাউন্টটি সাময়িকভাবে সাসপেন্ড করা আছে — মার্কেটপ্লেস অ্যাডমিনের সাথে যোগাযোগ করুন', 403);
    }

    const session = await createSellerSession(env, request, row.id);
    await env.DB.prepare(`UPDATE sellers SET last_login_at = datetime('now') WHERE id = ?`).bind(row.id).run();
    await logAttempt(env, request, row.id, username, true);

    const settings = await getMarketplaceSettings(env);
    const res = json({ ok: true, seller: publicSeller(row), subscription: computeSubscription(row, settings) });
    return withCookies(res, [session.cookie]);
  } catch (e) {
    return err('লগইন করা যায়নি — একটু পরে আবার চেষ্টা করুন', 500);
  }
}
