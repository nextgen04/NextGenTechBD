// POST /api/seller/products/:id/stock — { change, reason } স্টক ইন/আউট; GET → নিজের পণ্যের স্টক ইতিহাস
import { json, err } from '../../../../_lib/utils.js';
import { requireSeller } from '../../../../_lib/auth.js';
import { parseId } from '../../../../_lib/sellers.js';

export async function onRequestGet({ request, env, params }) {
  const auth = await requireSeller(request, env, { permission: 'products:read' });
  if (auth.response) return auth.response;
  const id = parseId(params.id);
  const p = id && await env.DB.prepare('SELECT id FROM products WHERE id = ? AND seller_id = ?').bind(id, auth.seller.id).first();
  if (!p) return err('পণ্য পাওয়া যায়নি', 404);
  const res = await env.DB.prepare('SELECT id, change, reason, created_at FROM stock_history WHERE product_id = ? AND seller_id = ? ORDER BY id DESC LIMIT 100').bind(id, auth.seller.id).all();
  return json({ history: res.results || [] });
}

export async function onRequestPost({ request, env, params }) {
  const auth = await requireSeller(request, env, { permission: 'stock:write', needSubscription: true });
  if (auth.response) return auth.response;
  const id = parseId(params.id);
  let b; try { b = await request.json(); } catch (e) { return err('অবৈধ রিকোয়েস্ট', 400); }
  const change = Number(b && b.change);
  if (!Number.isInteger(change) || change === 0 || Math.abs(change) > 1000000) return err('change শূন্য ছাড়া পূর্ণসংখ্যা হতে হবে', 400);
  const p = id && await env.DB.prepare('SELECT stock FROM products WHERE id = ? AND seller_id = ?').bind(id, auth.seller.id).first();
  if (!p) return err('পণ্য পাওয়া যায়নি', 404);
  const next = (p.stock || 0) + change;
  if (next < 0) return err('স্টক ঋণাত্মক হতে পারে না', 400);
  await env.DB.batch([
    env.DB.prepare(`UPDATE products SET stock = ?, updated_at = datetime('now') WHERE id = ? AND seller_id = ?`).bind(next, id, auth.seller.id),
    env.DB.prepare('INSERT INTO stock_history (product_id, change, reason, seller_id, changed_by) VALUES (?, ?, ?, ?, ?)')
      .bind(id, change, String((b && b.reason) || '').slice(0, 200) || null, auth.seller.id, 'seller:' + auth.seller.id),
  ]);
  return json({ ok: true, stock: next });
}
