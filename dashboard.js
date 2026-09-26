// GET /api/admin/dashboard — অ্যাডমিন প্যানেলের ড্যাশবোর্ড সারাংশ ও অ্যানালিটিক্স (X-Admin-Key হেডার লাগবে)
import { json, err, requireAdmin } from '../../_lib/utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  try {
    const [today, pending, delivered, newCustomersToday, totalCustomers, weekly, bestSelling, byCategory, statusBreakdown, lowStock] =
      await Promise.all([
        env.DB.prepare(
          `SELECT COUNT(*) as orders, COALESCE(SUM(total),0) as revenue
           FROM orders WHERE date(created_at) = date('now') AND status != 'cancelled'`
        ).first(),
        env.DB.prepare(`SELECT COUNT(*) as c FROM orders WHERE status IN ('pending','processing','confirmed')`).first(),
        env.DB.prepare(`SELECT COUNT(*) as c FROM orders WHERE status = 'delivered'`).first(),
        env.DB.prepare(`SELECT COUNT(*) as c FROM customers WHERE date(created_at) = date('now')`).first(),
        env.DB.prepare(`SELECT COUNT(*) as c FROM customers`).first(),
        env.DB.prepare(
          `SELECT date(created_at) as day, COUNT(*) as orders, COALESCE(SUM(total),0) as revenue
           FROM orders WHERE created_at >= date('now','-6 days') AND status != 'cancelled'
           GROUP BY date(created_at) ORDER BY day ASC`
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
          `SELECT id, name, stock, low_stock_at FROM products WHERE stock IS NOT NULL AND stock <= low_stock_at ORDER BY stock ASC LIMIT 20`
        ).all(),
      ]);

    const totalRevenueRow = await env.DB.prepare(
      `SELECT COALESCE(SUM(total),0) as revenue FROM orders WHERE status != 'cancelled'`
    ).first();

    return json({
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
