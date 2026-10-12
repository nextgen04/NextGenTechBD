// /api/seller/stock — শুধু নিজের পণ্যের স্টক (পারমিশন: can_stock_manage)
// GET  ?product_id=123 → স্টক ইতিহাস
// POST { product_id, change, reason } → স্টক ইন (+) / আউট (−); স্টক ০-র নিচে নামানো যাবে না
import { json, err } from '../../_lib/utils.js';
import { requireSeller, can, forbidden } from '../../_lib/seller.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const { seller, denied } = await requireSeller(request, env);
  if (denied) return denied;
  if (!can(seller, 'can_stock_manage')) return forbidden('can_stock_manage');
  try {
    const pid = Number(new URL(request.url).searchParams.get('product_id'));
    if (!Number.isInteger(pid) || pid <= 0) return err('product_id প্যারামিটার আবশ্যক', 400);
    const own = await env.DB.prepare('SELECT id FROM products WHERE id = ? AND seller_id = ?').bind(pid, seller.id).first();
    if (!own) return err('পণ্য পাওয়া যায়নি', 404);
    const res = await env.DB.prepare('SELECT id, change, reason, created_at FROM stock_history WHERE product_id = ? ORDER BY id DESC LIMIT 100').bind(pid).all();
    return json({ history: res.results || [] });
  } catch (e) {
    console.error('seller/stock GET failed:', e && e.message);
    return err('স্টক ইতিহাস লোড করা যায়নি', 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const { seller, denied } = await requireSeller(request, env);
  if (denied) return denied;
  if (!can(seller, 'can_stock_manage')) return forbidden('can_stock_manage');
  try {
    let b;
    try { b = await request.json(); } catch (e) { return err('অনুরোধ সঠিক নয়', 400); }
    const pid = Number(b && b.product_id), change = Number(b && b.change);
    if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(change) || change === 0 || Math.abs(change) > 1000000) {
      return err('product_id ও change (শূন্য ছাড়া পূর্ণসংখ্যা) আবশ্যক', 400);
    }
    const own = await env.DB.prepare('SELECT id FROM products WHERE id = ? AND seller_id = ?').bind(pid, seller.id).first();
    if (!own) return err('পণ্য পাওয়া যায়নি', 404);
    // একটাই অ্যাটমিক SQL — একসাথে দুটি রিকোয়েস্ট এলেও স্টক ০-র নিচে যায় না
    const r = await env.DB.prepare(
      'UPDATE products SET stock = COALESCE(stock, 0) + ? WHERE id = ? AND seller_id = ? AND COALESCE(stock, 0) + ? >= 0'
    ).bind(change, pid, seller.id, change).run();
    if (!r.meta || !r.meta.changes) return err('স্টক ০-র নিচে নামানো যাবে না', 409);
    await env.DB.prepare('INSERT INTO stock_history (product_id, change, reason) VALUES (?, ?, ?)')
      .bind(pid, change, b.reason ? String(b.reason).slice(0, 200) : null).run();
    const row = await env.DB.prepare('SELECT stock FROM products WHERE id = ? AND seller_id = ?').bind(pid, seller.id).first();
    return json({ ok: true, stock: row ? row.stock : null });
  } catch (e) {
    console.error('seller/stock POST failed:', e && e.message);
    return err('স্টক আপডেট করা যায়নি', 500);
  }
}
