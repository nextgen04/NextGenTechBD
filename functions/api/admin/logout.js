// POST /api/admin/logout — বর্তমান অ্যাডমিন সেশন বাতিল করে
import { json, sha256Hex } from '../../_lib/utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const token = request.headers.get('X-Admin-Key');
  if (token) {
    try {
      await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
    } catch (e) { /* ক্লায়েন্ট এমনিতেই লগআউট হয়ে যাবে */ }
  }
  return json({ ok: true });
}
