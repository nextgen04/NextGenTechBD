// POST /api/customer/logout — সেশন টোকেন বাতিল করা
import { json } from '../../_lib/utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const token = request.headers.get('X-Session-Token');
  if (token) {
    try {
      await env.DB.prepare('DELETE FROM customer_sessions WHERE token = ?').bind(token).run();
    } catch (e) {
      /* টোকেন না থাকলেও সমস্যা নেই, ক্লায়েন্ট এমনিতেই লগআউট হয়ে যাবে */
    }
  }
  return json({ ok: true });
}
