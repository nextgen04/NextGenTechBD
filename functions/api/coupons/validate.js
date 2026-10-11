// POST /api/coupons/validate — চেকআউটে কুপন কোড যাচাই (পাবলিক, লগইন লাগে না)
// body: { code, subtotal, phone, lines? } — phone দিলে "প্রথম অর্ডারের জন্য" কুপন যাচাই করা যায়।
// lines ([{id, qty}]) দিলে সাবটোটাল সার্ভার নিজে DB-র দাম থেকে হিসাব করে (ও সেলার-নির্দিষ্ট কুপন যাচাই হয়); না দিলে আগের মতো subtotal ব্যবহার হয়।
import { json, err } from '../../_lib/utils.js';
import { evaluateCoupon } from '../../_lib/coupons.js';
import { resolveLines, subtotalOf, sellerSubtotalsOf } from '../../_lib/checkout.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { code, subtotal, phone, lines } = await request.json();
    if (!code) return err('কুপন কোড দিন', 400);
    let sub = subtotal, sellerSubtotals = null;
    if (Array.isArray(lines) && lines.length) {
      const r = await resolveLines(env, lines, { checkStock: false });
      if (!r.error) { sub = subtotalOf(r.lines); sellerSubtotals = sellerSubtotalsOf(r.lines); }
    }
    const c = await evaluateCoupon(env, { code, subtotal: sub, phone, sellerSubtotals });
    if (c.error) return err(c.error, c.status);
    return json(c);
  } catch (e) {
    return err('কুপন যাচাই করা যায়নি: ' + e.message, 500);
  }
}
