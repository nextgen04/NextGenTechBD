// POST /api/seller/password — { current_password, new_password } নিজের পাসওয়ার্ড বদল; বর্তমান সেশন বাদে বাকি সব সেশন বাতিল
import { json, err, verifyPassword, createPasswordRecord } from '../../_lib/utils.js';
import { requireSeller, validatePassword, parseCookies, sha256Hex, SELLER_COOKIE } from '../../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  const auth = await requireSeller(request, env, { permission: 'profile:write' });
  if (auth.response) return auth.response;
  let b; try { b = await request.json(); } catch (e) { return err('অবৈধ রিকোয়েস্ট', 400); }
  const row = await env.DB.prepare('SELECT password_hash, password_salt FROM sellers WHERE id = ?').bind(auth.seller.id).first();
  if (!row || !(await verifyPassword(String((b && b.current_password) || ''), row.password_salt, row.password_hash))) return err('বর্তমান পাসওয়ার্ড ভুল', 403);
  const bad = validatePassword(b.new_password); if (bad) return err(bad, 400);
  const rec = await createPasswordRecord(b.new_password);
  const keep = await sha256Hex(parseCookies(request)[SELLER_COOKIE] || '');
  await env.DB.batch([
    env.DB.prepare(`UPDATE sellers SET password_hash = ?, password_salt = ?, updated_at = datetime('now') WHERE id = ?`).bind(rec.hash, rec.salt, auth.seller.id),
    env.DB.prepare('DELETE FROM seller_sessions WHERE seller_id = ? AND token_hash != ?').bind(auth.seller.id, keep),
  ]);
  return json({ ok: true });
}
