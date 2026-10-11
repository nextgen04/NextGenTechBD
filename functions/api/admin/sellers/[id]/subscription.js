// POST /api/admin/sellers/:id/subscription — Super Admin সেলারের ট্রায়াল/সাবস্ক্রিপশন নিয়ন্ত্রণ করে
//  { action: 'extend_trial',  days }                                   → ট্রায়াল বাড়ানো
//  { action: 'activate_plan', plan_id, payment_method?, payment_ref?, amount?, days? } → পেইড সাবস্ক্রিপশন চালু/নবায়ন (মেয়াদ জমা হয়)
//  { action: 'set_override',  value: 'allow' | 'deny' | null }          → ম্যানুয়াল ওভাররাইড (allow = সবসময় চালু, deny = বন্ধ)
//  { action: 'expire_now' }                                             → এখনই মেয়াদ শেষ
// প্রতিটি পরিবর্তন seller_subscriptions-এ অডিট হিসেবে জমা থাকে।
import { json, err } from '../../../../_lib/utils.js';
import { requireAdmin } from '../../../../_lib/auth.js';
import { getMarketplaceSettings, computeSubscription } from '../../../../_lib/subscription.js';
import { getSeller, parseId, recordSubscription, cleanText } from '../../../../_lib/sellers.js';

const METHODS = ['bkash', 'nagad', 'rocket', 'bank', 'cash', 'other'];
const DAY = 86400000;

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const id = parseId(params.id);
  if (!id) return err('সঠিক সেলার আইডি দিন', 400);
  try {
    const b = await request.json().catch(() => ({}));
    const seller = await getSeller(env, id);
    if (!seller || seller.deleted_at) return err('সেলার পাওয়া যায়নি', 404);
    if (seller.is_system) return err('সিস্টেম সেলারের জন্য সাবস্ক্রিপশন লাগে না', 400);
    const now = new Date();
    const note = cleanText(b.note, 300) || null;

    if (b.action === 'extend_trial') {
      const days = Number(b.days);
      if (!Number.isInteger(days) || days < 1 || days > 365) return err('দিন ১ থেকে ৩৬৫ এর মধ্যে পূর্ণসংখ্যা হতে হবে', 400);
      const cur = seller.trial_ends_at ? new Date(seller.trial_ends_at).getTime() : 0;
      const start = new Date(Math.max(now.getTime(), cur));
      const end = new Date(start.getTime() + days * DAY).toISOString();
      await env.DB.prepare(`UPDATE sellers SET trial_ends_at = ?, updated_at = datetime('now') WHERE id = ?`).bind(end, id).run();
      await recordSubscription(env, { sellerId: id, kind: 'extension', startsAt: start.toISOString(), endsAt: end, note: note || `ট্রায়াল ${days} দিন বাড়ানো হয়েছে` });
    } else if (b.action === 'activate_plan') {
      const planId = parseId(b.plan_id);
      const plan = planId ? await env.DB.prepare('SELECT id, name, price, duration_days FROM subscription_plans WHERE id = ?').bind(planId).first() : null;
      if (!plan) return err('সঠিক প্ল্যান বেছে নিন', 404);
      const method = b.payment_method ? String(b.payment_method) : null;
      if (method && !METHODS.includes(method)) return err('পেমেন্ট মাধ্যম সঠিক নয়', 400);
      const days = b.days !== undefined && b.days !== '' ? Number(b.days) : plan.duration_days;
      if (!Number.isInteger(days) || days < 1 || days > 3650) return err('দিন সঠিক নয়', 400);
      const amount = b.amount !== undefined && b.amount !== '' ? Number(b.amount) : plan.price;
      if (!(amount >= 0)) return err('পরিমাণ সঠিক নয়', 400);
      const cur = seller.subscription_ends_at ? new Date(seller.subscription_ends_at).getTime() : 0;
      const start = new Date(Math.max(now.getTime(), cur)); // চলমান মেয়াদের পর থেকে জমা হবে
      const end = new Date(start.getTime() + days * DAY).toISOString();
      await env.DB.prepare(`UPDATE sellers SET subscription_plan_id = ?, subscription_ends_at = ?, updated_at = datetime('now') WHERE id = ?`).bind(plan.id, end, id).run();
      await recordSubscription(env, { sellerId: id, planId: plan.id, kind: 'paid', amount, method, ref: cleanText(b.payment_ref, 80) || null, startsAt: start.toISOString(), endsAt: end, note });
    } else if (b.action === 'set_override') {
      const v = b.value === null || b.value === '' || b.value === undefined ? null : b.value;
      if (v !== null && !['allow', 'deny'].includes(v)) return err("value অবশ্যই 'allow', 'deny' অথবা null হতে হবে", 400);
      await env.DB.prepare(`UPDATE sellers SET access_override = ?, updated_at = datetime('now') WHERE id = ?`).bind(v, id).run();
      await recordSubscription(env, { sellerId: id, kind: 'adjustment', startsAt: now.toISOString(), endsAt: now.toISOString(), note: note || `ম্যানুয়াল ওভাররাইড: ${v || 'বন্ধ'}` });
    } else if (b.action === 'expire_now') {
      await env.DB.prepare(`UPDATE sellers SET trial_ends_at = ?, subscription_ends_at = ?, updated_at = datetime('now') WHERE id = ?`).bind(now.toISOString(), now.toISOString(), id).run();
      await recordSubscription(env, { sellerId: id, kind: 'adjustment', startsAt: now.toISOString(), endsAt: now.toISOString(), note: note || 'মেয়াদ এখনই শেষ করা হয়েছে' });
    } else {
      return err('অজানা action', 400);
    }

    const updated = await getSeller(env, id);
    return json({ ok: true, subscription: computeSubscription(updated, await getMarketplaceSettings(env)) });
  } catch (e) {
    return err('সাবস্ক্রিপশন আপডেট করা যায়নি: ' + e.message, 500);
  }
}
