// GET /api/admin/login-log — সাম্প্রতিক অ্যাডমিন লগইন চেষ্টার লগ (X-Admin-Key লাগবে)
import { json, err, requireAdmin } from '../../_lib/utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  try {
    const res = await env.DB.prepare(
      'SELECT id, success, ip, user_agent, created_at FROM admin_login_log ORDER BY id DESC LIMIT 100'
    ).all();
    return json({ logs: res.results || [] });
  } catch (e) {
    console.error('admin/login-log failed:', e && e.message);
    return err('লগ লোড করা যায়নি', 500);
  }
}
