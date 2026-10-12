// POST /api/seller/logout — বর্তমান Seller সেশন মুছে দেয়
import { json, err, sha256Hex } from '../../_lib/utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const token = request.headers.get('X-Seller-Token') || '';
    if (/^[0-9a-f]{64}$/.test(token)) {
      await env.DB.prepare('DELETE FROM seller_sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
    }
    return json({ ok: true });
  } catch (e) {
    return err('লগআউট করা যায়নি', 500);
  }
}
