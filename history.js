// GET /api/admin/orders/history?id=123 — অর্ডারের স্ট্যাটাস পরিবর্তনের ইতিহাস (X-Admin-Key লাগবে)
import { json, err, requireAdmin } from '../../../_lib/utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return err('id প্যারামিটার আবশ্যক', 400);
    const res = await env.DB.prepare(
      'SELECT id, status, note, created_at FROM order_status_history WHERE order_id = ? ORDER BY id ASC'
    ).bind(Number(id)).all();
    return json({ history: res.results || [] });
  } catch (e) {
    return err('ইতিহাস লোড করা যায়নি: ' + e.message, 500);
  }
}
