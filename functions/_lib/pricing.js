// অর্ডারের দাম/ডেলিভারি/কুপন হিসাব — সবসময় সার্ভারে, ডেটাবেজের আসল দাম দিয়ে (ব্রাউজারের পাঠানো দামের ওপর ভরসা করা হয় না)

// কুপন যাচাই: /api/coupons/validate ও /api/orders দুটোই এই একই ফাংশন ব্যবহার করে
// সফল হলে { ok:true, coupon, discount, freeShipping }, ব্যর্থ হলে { ok:false, status, error }
export async function evaluateCoupon(env, codeRaw, subtotal, phone) {
  const code = String(codeRaw || '').trim().toUpperCase();
  if (!code) return { ok: false, status: 400, error: 'কুপন কোড দিন' };

  const c = await env.DB.prepare('SELECT * FROM coupons WHERE code = ? AND active = 1').bind(code).first();
  if (!c) return { ok: false, status: 404, error: 'এই কুপন কোডটি সঠিক নয় অথবা বন্ধ আছে' };

  const now = new Date();
  if (c.start_date && now < new Date(c.start_date)) return { ok: false, status: 400, error: 'এই কুপনটি এখনো শুরু হয়নি' };
  if (c.end_date && now > new Date(c.end_date + 'T23:59:59')) return { ok: false, status: 400, error: 'এই কুপনের মেয়াদ শেষ হয়ে গেছে' };
  if (c.usage_limit && c.used_count >= c.usage_limit) return { ok: false, status: 400, error: 'এই কুপনের ব্যবহারসীমা শেষ হয়ে গেছে' };

  const sub = Number(subtotal) || 0;
  if (c.min_purchase && sub < c.min_purchase) {
    return { ok: false, status: 400, error: `এই কুপন ব্যবহার করতে কমপক্ষে ৳${c.min_purchase} কেনাকাটা করতে হবে` };
  }

  if (c.first_order_only && phone) {
    const prior = await env.DB.prepare('SELECT COUNT(*) as c FROM orders WHERE phone = ?').bind(String(phone)).first();
    if (prior && prior.c > 0) return { ok: false, status: 400, error: 'এই কুপনটি শুধু প্রথম অর্ডারের জন্য প্রযোজ্য' };
  }

  let discount = c.type === 'percent' ? Math.round((sub * c.value) / 100) : Math.round(c.value);
  discount = Math.max(0, Math.min(discount, sub));
  return { ok: true, coupon: c, discount, freeShipping: !!c.free_shipping };
}

// ডেলিভারি ফি — ফ্রন্টএন্ডের ckFeeOf() এর হুবহু নিয়ম
export function computeDeliveryFee(settings, district, subtotal, freeShipping) {
  if (freeShipping) return 0;
  const threshold = Number(settings.free_delivery_threshold) || 1999;
  if (subtotal >= threshold) return 0;
  const dhaka = settings.delivery_charge_dhaka ?? 60;
  const outside = settings.delivery_charge_outside ?? 120;
  return Math.max(0, Math.round(Number(district === 'ঢাকা' ? dhaka : outside) || 0));
}
