// GET /api/seller/reviews — শুধু নিজের পণ্যের অনুমোদিত (Super Admin moderate করা) রিভিউ + গড় রেটিং
import { json } from '../../_lib/utils.js';
import { requireSeller } from '../../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const auth = await requireSeller(request, env, { permission: 'reviews:read' });
  if (auth.response) return auth.response;
  const sid = auth.seller.id;
  const [list, agg] = await Promise.all([
    env.DB.prepare(`SELECT r.id, r.product_id, p.name AS product, r.customer_name, r.rating, r.comment, r.created_at
      FROM reviews r LEFT JOIN products p ON p.id = r.product_id WHERE r.seller_id = ? AND r.status = 'approved' ORDER BY r.id DESC LIMIT 200`).bind(sid).all(),
    env.DB.prepare(`SELECT COUNT(*) AS count, ROUND(AVG(rating), 2) AS average FROM reviews WHERE seller_id = ? AND status = 'approved'`).bind(sid).first(),
  ]);
  return json({ reviews: list.results || [], summary: { count: agg ? agg.count : 0, average: agg && agg.average ? agg.average : null } });
}
