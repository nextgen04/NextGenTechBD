// PATCH /api/admin/sellers/:id/status — { status: 'active' | 'suspended' | 'blocked' }
// suspended/blocked হলে সেলারের সব চলমান সেশন সাথে সাথে বাতিল হয়।
import { json, err } from '../../../../_lib/utils.js';
import { requireAdmin, revokeSellerSessions } from '../../../../_lib/auth.js';
import { getSeller, parseId, SELLER_STATUSES } from '../../../../_lib/sellers.js';

export async function onRequestPatch(context) {
  const { request, env, params } = context;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const id = parseId(params.id);
  if (!id) return err('সঠিক সেলার আইডি দিন', 400);
  try {
    const b = await request.json().catch(() => ({}));
    if (!SELLER_STATUSES.includes(b.status)) return err('status অবশ্যই active, suspended অথবা blocked হতে হবে', 400);
    const seller = await getSeller(env, id);
    if (!seller || seller.deleted_at) return err('সেলার পাওয়া যায়নি', 404);
    if (seller.is_system && b.status !== 'active') return err('সিস্টেম সেলার সাসপেন্ড/ব্লক করা যাবে না', 400);
    await env.DB.prepare(`UPDATE sellers SET status = ?, updated_at = datetime('now') WHERE id = ?`).bind(b.status, id).run();
    if (b.status !== 'active') await revokeSellerSessions(env, id);
    return json({ ok: true, status: b.status });
  } catch (e) {
    return err('স্ট্যাটাস আপডেট করা যায়নি: ' + e.message, 500);
  }
}
