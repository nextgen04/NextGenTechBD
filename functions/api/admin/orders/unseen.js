// /api/admin/orders/unseen — নতুন অর্ডার নোটিফিকেশনের জন্য (X-Admin-Key হেডার লাগবে)
// GET  → নতুন (seen=0) অর্ডারের সংখ্যা ও সংক্ষিপ্ত তালিকা — অ্যাডমিন প্যানেল প্রতি কিছুক্ষণ পরপর এটা চেক করে
//        নোটিফিকেশন ব্যাজ/সাউন্ড দেখানোর জন্য
// POST → সব (অথবা নির্দিষ্ট আইডির) অর্ডার "দেখা হয়েছে" হিসেবে চিহ্নিত করে (অ্যাডমিন অর্ডার ট্যাব খুললে কল হয়)
import { json, err, requireAdmin } from '../../../_lib/utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  try {
    const res = await env.DB.prepare(
      `SELECT id, order_no, name, phone, total, created_at FROM orders WHERE seen = 0 ORDER BY id DESC LIMIT 20`
    ).all();
    return json({ count: (res.results || []).length, orders: res.results || [] });
  } catch (e) {
    return err('নোটিফিকেশন লোড করা যায়নি: ' + e.message, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  try {
    const b = await request.json().catch(() => ({}));
    if (Array.isArray(b.ids) && b.ids.length) {
      const placeholders = b.ids.map(() => '?').join(',');
      await env.DB.prepare(`UPDATE orders SET seen = 1 WHERE id IN (${placeholders})`).bind(...b.ids.map(Number)).run();
    } else {
      await env.DB.prepare(`UPDATE orders SET seen = 1 WHERE seen = 0`).run();
    }
    return json({ ok: true });
  } catch (e) {
    return err('আপডেট করা যায়নি: ' + e.message, 500);
  }
}
