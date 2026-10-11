// GET /api/seller/dashboard — শুধু এই সেলারের পরিসংখ্যান (সব কুয়েরিতে seller_id = সেশনের seller)
import { json } from '../../_lib/utils.js';
import { requireSeller } from '../../_lib/auth.js';
import { salesSummary } from '../../_lib/sellers.js';

export async function onRequestGet({ request, env }) {
  const auth = await requireSeller(request, env, { permission: 'dashboard:read' });
  if (auth.response) return auth.response;
  const sid = auth.seller.id;
  const [prod, ord, sales, newItems, low] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END),0) AS active,
        COALESCE(SUM(CASE WHEN stock IS NOT NULL AND stock <= 0 THEN 1 ELSE 0 END),0) AS out_of_stock,
        COALESCE(SUM(CASE WHEN stock IS NOT NULL AND stock > 0 AND stock <= low_stock_at THEN 1 ELSE 0 END),0) AS low_stock
      FROM products WHERE seller_id = ?`).bind(sid).first(),
    env.DB.prepare(`SELECT COUNT(DISTINCT order_id) AS total,
        COUNT(DISTINCT CASE WHEN seller_status IN ('pending','processing','confirmed') THEN order_id END) AS pending,
        COUNT(DISTINCT CASE WHEN seller_status = 'shipped' THEN order_id END) AS shipped,
        COUNT(DISTINCT CASE WHEN seller_status = 'delivered' THEN order_id END) AS completed
      FROM order_items WHERE seller_id = ?`).bind(sid).first(),
    salesSummary(env, sid),
    env.DB.prepare(`SELECT oi.id, oi.order_id, o.order_no, oi.product_name_snapshot AS product, oi.quantity, oi.subtotal, oi.created_at
      FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.seller_id = ? AND oi.seller_seen = 0 ORDER BY oi.id DESC LIMIT 10`).bind(sid).all(),
    env.DB.prepare(`SELECT id, name, stock, low_stock_at FROM products WHERE seller_id = ? AND stock IS NOT NULL AND stock <= low_stock_at ORDER BY stock ASC LIMIT 10`).bind(sid).all(),
  ]);
  return json({
    products: prod, orders: ord, sales,
    new_orders: { count: (newItems.results || []).length, items: newItems.results || [] },
    low_stock_products: low.results || [],
    subscription: auth.subscription,
  });
}
