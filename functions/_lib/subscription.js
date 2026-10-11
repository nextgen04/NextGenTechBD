// ১৫ দিনের ফ্রি ট্রায়াল + সাবস্ক্রিপশন লজিক — Super Admin সব নিয়ন্ত্রণ করে (marketplace_settings + subscription_plans)

const DEFAULTS = {
  trial_days: '15',
  subscription_required: '1',
  expired_behavior: 'hide_products', // hide_products | keep_visible
  grace_days: '0',
  default_commission_percent: '0',
};

export async function getMarketplaceSettings(env) {
  const out = { ...DEFAULTS };
  try {
    const res = await env.DB.prepare('SELECT key, value FROM marketplace_settings').all();
    (res.results || []).forEach((r) => { out[r.key] = r.value; });
  } catch (e) { /* মাইগ্রেশন ০০৯ না চললে ডিফল্ট */ }
  return out;
}

export function trialEndDate(settings, from = new Date()) {
  const days = Math.max(0, Number(settings.trial_days) || 0);
  return new Date(from.getTime() + days * 24 * 3600 * 1000).toISOString();
}

const ts = (v) => { const t = v ? new Date(v).getTime() : NaN; return Number.isNaN(t) ? null : t; };

// state: exempt | override_allow | override_deny | trial | active | grace | expired
// can_sell   → নতুন পণ্য যোগ/এডিট করতে পারবে কিনা
// is_visible → পণ্য হোমপেজ/স্টোরে দেখানো হবে কিনা (seller status active হওয়াও লাগে — সেটা আলাদাভাবে চেক হয়)
export function computeSubscription(seller, settings, now = new Date()) {
  const n = now.getTime();
  const keepVisible = settings.expired_behavior === 'keep_visible';
  const mk = (state, can_sell, ends_at) => ({
    state,
    can_sell,
    is_visible: can_sell || keepVisible,
    ends_at: ends_at || null,
    days_left: ends_at ? Math.ceil((ts(ends_at) - n) / 86400000) : null,
  });

  if (!seller) return mk('expired', false, null);
  if (seller.is_system) return mk('exempt', true, null);
  if (seller.access_override === 'allow') return { ...mk('override_allow', true, null), is_visible: true };
  if (seller.access_override === 'deny') return mk('override_deny', false, null);
  if (String(settings.subscription_required) === '0') return mk('exempt', true, null);

  const paidEnd = ts(seller.subscription_ends_at);
  const trialEnd = ts(seller.trial_ends_at);
  if (paidEnd && paidEnd > n) return mk('active', true, seller.subscription_ends_at);
  if (trialEnd && trialEnd > n) return mk('trial', true, seller.trial_ends_at);

  const lastEnd = Math.max(paidEnd || 0, trialEnd || 0);
  const grace = Math.max(0, Number(settings.grace_days) || 0) * 86400000;
  if (lastEnd && lastEnd + grace > n) return mk('grace', true, new Date(lastEnd + grace).toISOString());
  return mk('expired', false, lastEnd ? new Date(lastEnd).toISOString() : null);
}
