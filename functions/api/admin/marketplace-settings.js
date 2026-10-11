// /api/admin/marketplace-settings — Super Admin: ট্রায়াল ও সাবস্ক্রিপশনের নিয়ম
// GET → বর্তমান সেটিংস
// PUT → { trial_days, subscription_required, expired_behavior, grace_days, default_commission_percent } (যেকোনো অংশ)
import { json, err, toBool } from '../../_lib/utils.js';
import { requireAdmin } from '../../_lib/auth.js';
import { getMarketplaceSettings } from '../../_lib/subscription.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  return json({ settings: await getMarketplaceSettings(env) });
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  try {
    const b = await request.json().catch(() => ({}));
    const upd = {};
    const int = (k, label, min, max) => {
      if (b[k] === undefined) return null;
      const n = Number(b[k]);
      if (!Number.isInteger(n) || n < min || n > max) return `${label} ${min} থেকে ${max} এর মধ্যে পূর্ণসংখ্যা হতে হবে`;
      upd[k] = String(n); return null;
    };
    const e1 = int('trial_days', 'ট্রায়ালের দিন', 0, 365) || int('grace_days', 'গ্রেস দিন', 0, 90);
    if (e1) return err(e1, 400);
    if (b.default_commission_percent !== undefined) {
      const c = Number(b.default_commission_percent);
      if (!(c >= 0 && c <= 100)) return err('কমিশন ০ থেকে ১০০ এর মধ্যে হতে হবে', 400);
      upd.default_commission_percent = String(c);
    }
    if (b.subscription_required !== undefined) upd.subscription_required = toBool(b.subscription_required) ? '1' : '0';
    if (b.expired_behavior !== undefined) {
      if (!['hide_products', 'keep_visible'].includes(b.expired_behavior)) return err('expired_behavior সঠিক নয়', 400);
      upd.expired_behavior = b.expired_behavior;
    }
    const keys = Object.keys(upd);
    if (!keys.length) return err('আপডেট করার মতো কোনো তথ্য দেওয়া হয়নি', 400);
    await env.DB.batch(keys.map((k) => env.DB.prepare(
      `INSERT INTO marketplace_settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).bind(k, upd[k])));
    return json({ ok: true, settings: await getMarketplaceSettings(env) });
  } catch (e) {
    return err('সেটিংস সংরক্ষণ করা যায়নি: ' + e.message, 500);
  }
}
