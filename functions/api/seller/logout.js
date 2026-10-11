// POST /api/seller/logout — সার্ভারে সেশন মুছে cookie বাতিল করে
import { json, err } from '../../_lib/utils.js';
import { checkSameOrigin, destroySellerSession, clearCookie, withCookies, SELLER_COOKIE } from '../../_lib/auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!checkSameOrigin(request)) return err('অনুমোদিত নয় (cross-site রিকোয়েস্ট)', 403);
  await destroySellerSession(request, env);
  return withCookies(json({ ok: true }), [clearCookie(request, SELLER_COOKIE)]);
}
