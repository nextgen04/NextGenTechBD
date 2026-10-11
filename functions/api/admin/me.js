// GET /api/admin/me — বর্তমান রিকোয়েস্ট Super Admin হিসেবে অনুমোদিত কিনা
import { json } from '../../_lib/utils.js';
import { requireAdmin } from '../../_lib/auth.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  return json({ ok: true, role: 'SUPER_ADMIN' });
}
