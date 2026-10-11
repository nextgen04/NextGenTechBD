// POST /api/admin/sellers/:id/reset-password — { password? }
// password না দিলে র‍্যান্ডম পাসওয়ার্ড তৈরি হয় ও শুধু এই রেসপন্সে একবার ফেরত আসে (DB-তে শুধু হ্যাশ থাকে)।
// রিসেটের পর সেলারের সব পুরনো সেশন বাতিল ও ব্যর্থ-লগইন লক পরিষ্কার হয়।
import { json, err, createPasswordRecord } from '../../../../_lib/utils.js';
import { requireAdmin, validatePassword, revokeSellerSessions } from '../../../../_lib/auth.js';
import { getSeller, parseId, generatePassword } from '../../../../_lib/sellers.js';

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const id = parseId(params.id);
  if (!id) return err('সঠিক সেলার আইডি দিন', 400);
  try {
    const b = await request.json().catch(() => ({}));
    const seller = await getSeller(env, id);
    if (!seller || seller.deleted_at) return err('সেলার পাওয়া যায়নি', 404);
    if (seller.is_system) return err('সিস্টেম সেলারের পাসওয়ার্ড নেই — এই অ্যাকাউন্টে লগইন করা যায় না', 400);

    let password = b.password ? String(b.password) : '';
    let generated = null;
    if (!password) { password = generatePassword(12); generated = password; }
    else { const pe = validatePassword(password); if (pe) return err(pe, 400); }

    const { salt, hash } = await createPasswordRecord(password);
    await env.DB.prepare(`UPDATE sellers SET password_hash = ?, password_salt = ?, updated_at = datetime('now') WHERE id = ?`).bind(hash, salt, id).run();
    await revokeSellerSessions(env, id);
    await env.DB.prepare('DELETE FROM seller_login_log WHERE username = ? AND success = 0').bind(seller.username).run();
    return json({ ok: true, ...(generated ? { generated_password: generated, notice: 'এই পাসওয়ার্ড শুধু এখনই দেখানো হচ্ছে — সেলারকে জানিয়ে দিন' } : {}) });
  } catch (e) {
    return err('পাসওয়ার্ড রিসেট করা যায়নি: ' + e.message, 500);
  }
}
