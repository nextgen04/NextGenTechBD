// GET /api/admin/dashboard — অ্যাডমিন প্যানেলের ড্যাশবোর্ড সারাংশ ও অ্যানালিটিক্স (X-Admin-Key হেডার লাগবে)
import { json, err } from '../../_lib/utils.js';
import { requireAdmin } from '../../_lib/auth.js';
import { getMarketplaceSettings, computeSubscription } from '../../_lib/subscription.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;

  try {
    const [today, pending, delivered, newCustomersToday, totalCustomers, weekly, bestSelling, byCategory, statusBreakdown, lowStock] =
      await Promise.all([
        env.DB.prepare(
          `SELECT COUNT(*) as orders, COALESCE(SUM(total),0) as revenue
           FROM orders WHERE date(created_at, '+6 hours') = date('now', '+6 hours') AND status != 'cancelled'`
        ).first(),
        env.DB.prepare(`SELECT COUNT(*) as c FROM orders WHERE status IN ('pending','processing','confirmed')`).first(),
        env.DB.prepare(`SELECT COUNT(*) as c FROM orders WHERE status = 'delivered'`).first(),
        env.DB.prepare(`SELECT COUNT(*) as c FROM customers WHERE date(created_at, '+6 hours') = date('now', '+6 hours')`).first(),
        env.DB.prepare(`SELECT COUNT(*) as c FROM customers`).first(),
        env.DB.prepare(
          `SELECT date(created_at, '+6 hours') as day, COUNT(*) as orders, COALESCE(SUM(total),0) as revenue
           FROM orders WHERE date(created_at, '+6 hours') >= date('now', '+6 hours', '-6 days') AND status != 'cancelled'
           GROUP BY date(created_at, '+6 hours') ORDER BY day ASC`
        ).all(),
        env.DB.prepare(
          `SELECT name, COALESCE(sold,0) as sold FROM products ORDER BY sold DESC LIMIT 5`
        ).all(),
        env.DB.prepare(
          `SELECT cat, COUNT(*) as products FROM products GROUP BY cat ORDER BY products DESC LIMIT 8`
        ).all(),
        env.DB.prepare(
          `SELECT status, COUNT(*) as c FROM orders GROUP BY status`
        ).all(),
        env.DB.prepare(
          `SELECT p.id, p.name, p.stock, p.low_stock_at, (SELECT store_name FROM sellers s WHERE s.id = p.seller_id) AS seller_name FROM products p WHERE p.stock IS NOT NULL AND p.stock <= p.low_stock_at ORDER BY p.stock ASC LIMIT 20`
        ).all(),
      ]);

    const totalRevenueRow = await env.DB.prepare(
      `SELECT COALESCE(SUM(total),0) as revenue FROM orders WHERE status != 'cancelled'`
    ).first();

    // ===== মার্কেটপ্লেস পরিসংখ্যান (শুধু তথ্যমূলক) — বিক্রি = বাতিল/ফেরত বাদে order_items.subtotal =====
    let marketplace = null;
    try {
      const SOLD = `seller_status NOT IN ('cancelled','returned')`;
      const [sl, pr, od, sales, top, topProd, subs] = await Promise.all([
        env.DB.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(status='active'),0) AS active, COALESCE(SUM(status='suspended'),0) AS suspended, COALESCE(SUM(status='blocked'),0) AS blocked
                        FROM sellers WHERE deleted_at IS NULL AND is_system = 0`).first(),
        env.DB.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(COALESCE(status,'active')='active'),0) AS active FROM products`).first(),
        env.DB.prepare(`SELECT COUNT(DISTINCT order_id) AS total FROM order_items`).first(),
        env.DB.prepare(`SELECT COALESCE(SUM(subtotal),0) AS total,
                          COALESCE(SUM(CASE WHEN date(created_at, '+6 hours') = date('now', '+6 hours') THEN subtotal END),0) AS today,
                          COALESCE(SUM(CASE WHEN strftime('%Y-%m', created_at, '+6 hours') = strftime('%Y-%m','now', '+6 hours') THEN subtotal END),0) AS month
                        FROM order_items WHERE ${SOLD}`).first(),
        env.DB.prepare(`SELECT s.id, s.store_name, s.is_system, COALESCE(SUM(oi.subtotal),0) AS sales, COUNT(DISTINCT oi.order_id) AS orders
                        FROM order_items oi JOIN sellers s ON s.id = oi.seller_id WHERE oi.${SOLD} GROUP BY s.id ORDER BY sales DESC LIMIT 5`).all(),
        env.DB.prepare(`SELECT COALESCE(oi.product_id, 0) AS id, oi.product_name_snapshot AS name, s.store_name, SUM(oi.quantity) AS qty, SUM(oi.subtotal) AS sales
                        FROM order_items oi JOIN sellers s ON s.id = oi.seller_id WHERE oi.${SOLD} GROUP BY oi.product_id, oi.product_name_snapshot, s.store_name ORDER BY qty DESC, sales DESC LIMIT 5`).all(),
        env.DB.prepare(`SELECT trial_ends_at, subscription_ends_at, access_override FROM sellers WHERE deleted_at IS NULL AND is_system = 0 AND status = 'active'`).all(),
      ]);
      const settings = await getMarketplaceSettings(env);
      const sub = { trial: 0, active: 0, expiring_soon: 0, expired: 0 };
      for (const s of subs.results || []) {
        const c = computeSubscription(s, settings);
        if (c.state === 'trial') sub.trial++; else if (c.state === 'active') sub.active++; else if (!c.can_sell) sub.expired++;
        if ((c.state === 'trial' || c.state === 'active') && c.days_left !== null && c.days_left <= 7) sub.expiring_soon++;
      }
      marketplace = {
        sellers: sl, products: pr, orders: od.total || 0, sales,
        top_sellers: top.results || [], top_products: topProd.results || [], subscriptions: sub,
      };
    } catch (e) { /* মাইগ্রেশন ০০৭/০০৮ না চললে মার্কেটপ্লেস অংশ বাদ — বাকি ড্যাশবোর্ড ঠিকই চলবে */ }

    return json({
      marketplace,
      today: { orders: today.orders || 0, revenue: today.revenue || 0 },
      pending_orders: pending.c || 0,
      delivered_orders: delivered.c || 0,
      new_customers_today: newCustomersToday.c || 0,
      total_customers: totalCustomers.c || 0,
      total_revenue: totalRevenueRow.revenue || 0,
      weekly_sales: weekly.results || [],
      best_selling: bestSelling.results || [],
      sales_by_category: byCategory.results || [],
      status_breakdown: statusBreakdown.results || [],
      low_stock: lowStock.results || [],
    });
  } catch (e) {
    return err('ড্যাশবোর্ড লোড করা যায়নি: ' + e.message, 500);
  }
}
