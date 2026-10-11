// কুপন যাচাই — /api/coupons/validate ও চেকআউট (/api/orders) দুটোই একই লজিক ব্যবহার করে (সার্ভারই চূড়ান্ত সিদ্ধান্ত নেয়)।
// seller_id NULL = গ্লোবাল কুপন (পুরো কার্টে); seller_id = X = শুধু ওই সেলারের পণ্যের উপর।
// sellerSubtotals: { [seller_id]: সেই সেলারের পণ্যের সাবটোটাল } — না দিলে সেলার-নির্দিষ্ট কুপন যাচাই করা যায় না।
export async function evaluateCoupon(env, { code, subtotal, phone, sellerSubtotals = null }) {
  const c = await env.DB.prepare('SELECT * FROM coupons WHERE code = ? AND active = 1').bind(String(code).trim().toUpperCase()).first();
  if (!c) return { error: 'এই কুপন কোডটি সঠিক নয় অথবা বন্ধ আছে', status: 404 };

  const now = new Date();
  // তারিখ-মাত্র মান (YYYY-MM-DD) বাংলাদেশ সময় (UTC+6) ধরে: শুরু = ভোর ০০:০০, শেষ = রাত ২৩:৫৯:৫৯
  const bd = (d, t) => (/^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? new Date(d + t + '+06:00') : new Date(d));
  if (c.start_date && now < bd(c.start_date, 'T00:00:00')) return { error: 'এই কুপনটি এখনো শুরু হয়নি', status: 400 };
  if (c.end_date && now > bd(c.end_date, 'T23:59:59')) return { error: 'এই কুপনের মেয়াদ শেষ হয়ে গেছে', status: 400 };
  if (c.usage_limit && c.used_count >= c.usage_limit) return { error: 'এই কুপনের ব্যবহারসীমা শেষ হয়ে গেছে', status: 400 };

  let sub = Number(subtotal) || 0;
  if (c.seller_id) {
    sub = sellerSubtotals ? Number(sellerSubtotals[c.seller_id]) || 0 : 0;
    if (sub <= 0) return { error: 'এই কুপনটি শুধু নির্দিষ্ট সেলারের পণ্যের জন্য প্রযোজ্য', status: 400 };
  }
  if (c.min_purchase && sub < c.min_purchase) {
    return { error: `এই কুপন ব্যবহার করতে কমপক্ষে ৳${c.min_purchase} কেনাকাটা করতে হবে`, status: 400 };
  }
  if (c.first_order_only && phone) {
    const prior = await env.DB.prepare('SELECT COUNT(*) as c FROM orders WHERE phone = ?').bind(phone).first();
    if (prior && prior.c > 0) return { error: 'এই কুপনটি শুধু প্রথম অর্ডারের জন্য প্রযোজ্য', status: 400 };
  }
  let discount = c.type === 'percent' ? Math.round((sub * c.value) / 100) : Math.round(c.value);
  discount = Math.min(discount, sub);
  return { ok: true, code: c.code, type: c.type, value: c.value, discount, free_shipping: !!c.free_shipping, seller_id: c.seller_id || null };
}
