// GET /api/seller/me — লগইন করা Seller-এর প্রোফাইল, পারমিশন ও নিজের পণ্যের সারাংশ
import { json, err } from '../../_lib/utils.js';
import { requireSeller, publicSeller, can } from '../../_lib/seller.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const { seller, denied } = await requireSeller(request, env);
  if (denied) return denied;
  try {
    const p = await env.DB.prepare(
      `SELECT COUNT(*) AS products,
              SUM(CASE WHEN stock IS NOT NULL AND stock <= COALESCE(low_stock_at, 5) THEN 1 ELSE 0 END) AS low_stock
       FROM products WHERE seller_id = ?`
    ).bind(seller.id).first();
    let pending = null;
    if (can(seller, 'can_order_manage')) {
      const o = await env.DB.prepare(
        "SELECT COUNT(DISTINCT order_id) AS c FROM order_items WHERE seller_id = ? AND status IN ('pending','processing','confirmed')"
      ).bind(seller.id).first();
      pending = o ? o.c : 0;
    }
    return json({ seller: publicSeller(seller), summary: { products: (p && p.products) || 0, low_stock: (p && p.low_stock) || 0, pending_orders: pending } });
  } catch (e) {
    console.error('seller/me failed:', e && e.message);
    return err('তথ্য লোড করা যায়নি', 500);
  }
}
