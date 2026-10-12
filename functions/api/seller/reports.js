// GET /api/seller/reports?from=YYYY-MM-DD&to=YYYY-MM-DD — নিজের বিক্রয় রিপোর্ট (পারমিশন: can_sales_report)
// বাতিল (cancelled) ও ফেরত (returned) লাইন হিসাবে ধরা হয় না। শুধু এই Seller-এর order_items থেকে হিসাব হয়।
// ℹ️ কুপন ছাড় ও ডেলিভারি ফি প্ল্যাটফর্ম-লেভেলের — এখানে পণ্যের মূল বিক্রয় (মূল্য × পরিমাণ) দেখানো হয়।
import { json, err } from '../../_lib/utils.js';
import { requireSeller, can, forbidden } from '../../_lib/seller.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const iso = (d) => d.toISOString().slice(0, 10);

export async function onRequestGet(context) {
  const { request, env } = context;
  const { seller, denied } = await requireSeller(request, env);
  if (denied) return denied;
  if (!can(seller, 'can_sales_report')) return forbidden('can_sales_report');
  try {
    const sp = new URL(request.url).searchParams;
    let to = sp.get('to') || iso(new Date());
    let from = sp.get('from') || iso(new Date(Date.now() - 29 * 86400000));
    if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) return err('তারিখ সঠিক নয় (YYYY-MM-DD)', 400);

    const live = "oi.status NOT IN ('cancelled','returned') AND oi.seller_id = ? AND date(oi.created_at) BETWEEN ? AND ?";
    const args = [seller.id, from, to];
    const [tot, daily, top, byStatus] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(DISTINCT oi.order_id) AS orders, COALESCE(SUM(oi.qty),0) AS units, COALESCE(SUM(oi.line_total),0) AS revenue FROM order_items oi WHERE ${live}`).bind(...args).first(),
      env.DB.prepare(`SELECT date(oi.created_at) AS day, COUNT(DISTINCT oi.order_id) AS orders, SUM(oi.qty) AS units, SUM(oi.line_total) AS revenue FROM order_items oi WHERE ${live} GROUP BY date(oi.created_at) ORDER BY day ASC`).bind(...args).all(),
      env.DB.prepare(`SELECT oi.product_id, oi.name, SUM(oi.qty) AS units, SUM(oi.line_total) AS revenue FROM order_items oi WHERE ${live} GROUP BY oi.product_id, oi.name ORDER BY revenue DESC LIMIT 10`).bind(...args).all(),
      env.DB.prepare('SELECT oi.status, COUNT(DISTINCT oi.order_id) AS orders FROM order_items oi WHERE oi.seller_id = ? AND date(oi.created_at) BETWEEN ? AND ? GROUP BY oi.status').bind(...args).all(),
    ]);
    return json({ from, to, totals: tot, daily: daily.results || [], top_products: top.results || [], status_breakdown: byStatus.results || [] });
  } catch (e) {
    console.error('seller/reports failed:', e && e.message);
    return err('রিপোর্ট লোড করা যায়নি', 500);
  }
}
