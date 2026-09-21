// /api/admin/stock — অ্যাডমিন প্যানেল থেকে স্টক ইন/আউট/অ্যাডজাস্টমেন্ট (X-Admin-Key হেডার লাগবে)
// POST → { product_id, change, reason } — change ধনাত্মক হলে স্টক বাড়ে (Stock In), ঋণাত্মক হলে কমে (Stock Out)
// GET  → ?product_id=123 দিয়ে সেই পণ্যের স্টক পরিবর্তনের ইতিহাস
import { json, err, requireAdmin } from '../../_lib/utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  try {
    const productId = new URL(request.url).searchParams.get('product_id');
    if (!productId) return err('product_id প্যারামিটার আবশ্যক', 400);
    const res = await env.DB.prepare(
      'SELECT id, change, reason, created_at FROM stock_history WHERE product_id = ? ORDER BY id DESC LIMIT 100'
    ).bind(Number(productId)).all();
    return json({ history: res.results || [] });
  } catch (e) {
    return err('স্টক ইতিহাস লোড করা যায়নি: ' + e.message, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  try {
    const b = await request.json();
    const productId = Number(b.product_id);
    const change = Number(b.change);
    if (!productId || !change) return err('product_id ও change (শূন্য ছাড়া) আবশ্যক', 400);

    const product = await env.DB.prepare('SELECT stock FROM products WHERE id = ?').bind(productId).first();
    if (!product) return err('পণ্য পাওয়া যায়নি', 404);

    const newStock = (product.stock || 0) + change;
    await env.DB.batch([
      env.DB.prepare('UPDATE products SET stock = ? WHERE id = ?').bind(newStock, productId),
      env.DB.prepare('INSERT INTO stock_history (product_id, change, reason) VALUES (?, ?, ?)').bind(productId, change, b.reason || null),
    ]);

    return json({ ok: true, stock: newStock });
  } catch (e) {
    return err('স্টক আপডেট করা যায়নি: ' + e.message, 500);
  }
}
