// /api/seller/stock — সেলার শুধু নিজের পণ্যের স্টক বদলাতে/ইতিহাস দেখতে পারে
// POST → { product_id, change, reason } (ধনাত্মক = Stock In, ঋণাত্মক = Stock Out; স্টক ০-এর নিচে যাবে না)
// GET  → ?product_id= স্টক ইতিহাস
import { json, err } from '../../_lib/utils.js';
import { requireSeller } from '../../_lib/auth.js';
import { parseId, cleanText } from '../../_lib/sellers.js';
import { getOwnedProduct } from '../../_lib/products.js';

export async function onRequestGet({ request, env }) {
  const auth = await requireSeller(request, env, { permission: 'products:read' });
  if (auth.response) return auth.response;
  const pid = parseId(new URL(request.url).searchParams.get('product_id'));
  if (!pid) return err('product_id আবশ্যক', 400);
  if (!(await getOwnedProduct(env, pid, auth.seller.id))) return err('পণ্য পাওয়া যায়নি', 404);
  const res = await env.DB.prepare('SELECT id, change, reason, changed_by, created_at FROM stock_history WHERE product_id = ? AND seller_id = ? ORDER BY id DESC LIMIT 100').bind(pid, auth.seller.id).all();
  return json({ history: res.results || [] });
}

export async function onRequestPost({ request, env }) {
  const auth = await requireSeller(request, env, { permission: 'stock:write' });
  if (auth.response) return auth.response;
  const sid = auth.seller.id;
  try {
    let b; try { b = await request.json(); } catch (e) { return err('অবৈধ রিকোয়েস্ট', 400); }
    const pid = parseId(b.product_id); const change = Number(b.change);
    if (!pid || !Number.isInteger(change) || change === 0 || Math.abs(change) > 1000000) return err('product_id ও change (শূন্য ছাড়া পূর্ণসংখ্যা) আবশ্যক', 400);
    const p = await getOwnedProduct(env, pid, sid);
    if (!p) return err('পণ্য পাওয়া যায়নি', 404);
    const newStock = (p.stock || 0) + change;
    if (newStock < 0) return err(`স্টক ০-এর নিচে নামানো যাবে না (বর্তমান স্টক: ${p.stock || 0})`, 400);
    const reason = cleanText(b.reason, 200) || null;
    await env.DB.batch([
      env.DB.prepare('UPDATE products SET stock = ?, updated_at = datetime(\'now\') WHERE id = ? AND seller_id = ?').bind(newStock, pid, sid),
      env.DB.prepare('INSERT INTO stock_history (product_id, change, reason, seller_id, changed_by) VALUES (?, ?, ?, ?, ?)').bind(pid, change, reason, sid, 'seller:' + sid),
    ]);
    return json({ ok: true, stock: newStock });
  } catch (e) { return err('স্টক আপডেট করা যায়নি: ' + e.message, 500); }
}
