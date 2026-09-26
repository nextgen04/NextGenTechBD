// POST /api/coupons/validate — চেকআউটে কুপন কোড যাচাই (পাবলিক, লগইন লাগে না)
// body: { code, subtotal, phone } — phone দিলে "প্রথম অর্ডারের জন্য" কুপন যাচাই করা যায়
import { json, err } from '../../_lib/utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { code, subtotal, phone } = await request.json();
    if (!code) return err('কুপন কোড দিন', 400);

    const c = await env.DB.prepare('SELECT * FROM coupons WHERE code = ? AND active = 1').bind(String(code).trim().toUpperCase()).first();
    if (!c) return err('এই কুপন কোডটি সঠিক নয় অথবা বন্ধ আছে', 404);

    const now = new Date();
    if (c.start_date && now < new Date(c.start_date)) return err('এই কুপনটি এখনো শুরু হয়নি', 400);
    if (c.end_date && now > new Date(c.end_date + 'T23:59:59')) return err('এই কুপনের মেয়াদ শেষ হয়ে গেছে', 400);
    if (c.usage_limit && c.used_count >= c.usage_limit) return err('এই কুপনের ব্যবহারসীমা শেষ হয়ে গেছে', 400);

    const sub = Number(subtotal) || 0;
    if (c.min_purchase && sub < c.min_purchase) {
      return err(`এই কুপন ব্যবহার করতে কমপক্ষে ৳${c.min_purchase} কেনাকাটা করতে হবে`, 400);
    }

    if (c.first_order_only && phone) {
      const prior = await env.DB.prepare('SELECT COUNT(*) as c FROM orders WHERE phone = ?').bind(phone).first();
      if (prior && prior.c > 0) return err('এই কুপনটি শুধু প্রথম অর্ডারের জন্য প্রযোজ্য', 400);
    }

    let discount = c.type === 'percent' ? Math.round((sub * c.value) / 100) : Math.round(c.value);
    discount = Math.min(discount, sub);

    return json({
      ok: true,
      code: c.code,
      type: c.type,
      value: c.value,
      discount,
      free_shipping: !!c.free_shipping,
    });
  } catch (e) {
    return err('কুপন যাচাই করা যায়নি: ' + e.message, 500);
  }
}
