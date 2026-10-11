// POST /api/coupons/validate — চেকআউটে কুপন কোড যাচাই (পাবলিক, লগইন লাগে না)
// body: { code, subtotal, phone } — phone দিলে "প্রথম অর্ডারের জন্য" কুপন যাচাই করা যায়
// (আসল যাচাই আবার /api/orders এ সার্ভার-সাইডে হয়; এটা শুধু চেকআউটে ছাড় দেখানোর জন্য)
import { json, err } from '../../_lib/utils.js';
import { evaluateCoupon } from '../../_lib/pricing.js';
import { rateLimit } from '../../_lib/ratelimit.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const limited = await rateLimit(env, request, 'coupon', 30, 10 * 60);
  if (limited) return limited;
  try {
    let body;
    try { body = await request.json(); } catch (e) { return err('অনুরোধ সঠিক নয়', 400); }
    const { code, subtotal, phone } = body || {};
    const r = await evaluateCoupon(env, code, subtotal, phone);
    if (!r.ok) return err(r.error, r.status);
    const c = r.coupon;
    return json({ ok: true, code: c.code, type: c.type, value: c.value, discount: r.discount, free_shipping: r.freeShipping });
  } catch (e) {
    console.error('coupon validate failed:', e && e.message);
    return err('কুপন যাচাই করা যায়নি', 500);
  }
}
