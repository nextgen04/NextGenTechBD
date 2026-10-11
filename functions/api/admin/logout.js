// POST /api/admin/logout — admin cookie সেশন মুছে ফেলে
import { json, err } from '../../_lib/utils.js';
import { checkSameOrigin, destroyAdminSession, clearCookie, withCookies, ADMIN_COOKIE } from '../../_lib/auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!checkSameOrigin(request)) return err('অনুমোদিত নয় (cross-site রিকোয়েস্ট)', 403);
  await destroyAdminSession(request, env);
  return withCookies(json({ ok: true }), [clearCookie(request, ADMIN_COOKIE)]);
}
