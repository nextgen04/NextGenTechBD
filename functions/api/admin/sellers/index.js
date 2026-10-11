// /api/admin/sellers — Super Admin: সেলার তালিকা ও নতুন সেলার তৈরি
// GET  → ?q=নাম/স্টোর/ইউজারনেম/ফোন&status=active|suspended|blocked&include_deleted=1 — প্রতিটি সেলারের পণ্য/অর্ডার/সেলস সহ
// POST → { name, store_name, username, password?, phone?, email?, address?, logo?, description?, status?, trial_days? }
//        password না দিলে র‍্যান্ডম পাসওয়ার্ড তৈরি হয় ও শুধু এই রেসপন্সে একবার দেখানো হয়।
//        নতুন সেলার স্বয়ংক্রিয়ভাবে ফ্রি ট্রায়ালে (ডিফল্ট ১৫ দিন) শুরু হয়।
import { json, err, createPasswordRecord } from '../../../_lib/utils.js';
import { requireAdmin, validateUsername, validatePassword, publicSeller } from '../../../_lib/auth.js';
import { getMarketplaceSettings, computeSubscription, trialEndDate } from '../../../_lib/subscription.js';
import { validateProfile, uniqueSlug, generatePassword, sellerCodeFor, isReservedUsername, recordSubscription, SELLER_STATUSES, getSeller } from '../../../_lib/sellers.js';
import { randomToken } from '../../../_lib/auth.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim();
    const status = (url.searchParams.get('status') || '').trim();
    let sql = `SELECT s.id, s.seller_code, s.username, s.slug, s.name, s.store_name, s.phone, s.email, s.logo, s.status, s.is_system,
                      s.trial_ends_at, s.subscription_plan_id, s.subscription_ends_at, s.access_override, s.created_at, s.last_login_at, s.deleted_at,
                      (SELECT COUNT(*) FROM products p WHERE p.seller_id = s.id) AS products,
                      (SELECT COUNT(DISTINCT oi.order_id) FROM order_items oi WHERE oi.seller_id = s.id) AS orders,
                      (SELECT COALESCE(SUM(oi.subtotal),0) FROM order_items oi WHERE oi.seller_id = s.id AND oi.seller_status NOT IN ('cancelled','returned')) AS sales
               FROM sellers s WHERE 1=1`;
    const binds = [];
    if (url.searchParams.get('include_deleted') !== '1') sql += ' AND s.deleted_at IS NULL';
    if (q) {
      sql += ' AND (s.name LIKE ? OR s.store_name LIKE ? OR s.username LIKE ? OR s.phone LIKE ? OR s.seller_code LIKE ?)';
      const like = '%' + q + '%'; binds.push(like, like, like, like, like);
    }
    if (SELLER_STATUSES.includes(status)) { sql += ' AND s.status = ?'; binds.push(status); }
    sql += ' ORDER BY s.is_system DESC, s.id DESC LIMIT 500';
    const res = await env.DB.prepare(sql).bind(...binds).all();
    const settings = await getMarketplaceSettings(env);
    const sellers = (res.results || []).map((s) => ({ ...s, subscription: computeSubscription(s, settings) }));
    return json({ sellers, settings: { trial_days: Number(settings.trial_days) } });
  } catch (e) {
    return err('সেলার তালিকা লোড করা যায়নি: ' + e.message, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  try {
    let b;
    try { b = await request.json(); } catch (e) { return err('অবৈধ রিকোয়েস্ট', 400); }

    const username = String(b.username || '').trim().toLowerCase();
    if (!validateUsername(username)) return err('ইউজারনেম ৩–৩০ অক্ষরের হতে হবে (a-z, 0-9, _ . -)', 400);
    if (isReservedUsername(username)) return err('এই ইউজারনেমটি সংরক্ষিত — অন্যটি বেছে নিন', 400);

    const profile = validateProfile(b);
    if (profile.error) return err(profile.error, 400);

    let password = b.password ? String(b.password) : '';
    let generated = null;
    if (!password) { password = generatePassword(12); generated = password; }
    else { const pe = validatePassword(password); if (pe) return err(pe, 400); }

    const status = b.status === undefined ? 'active' : b.status;
    if (!SELLER_STATUSES.includes(status)) return err('status অবশ্যই active, suspended অথবা blocked হতে হবে', 400);

    const exists = await env.DB.prepare('SELECT id FROM sellers WHERE username = ?').bind(username).first();
    if (exists) return err('এই ইউজারনেমটি আগে থেকেই আছে — অন্যটি দিন', 409);

    const settings = await getMarketplaceSettings(env);
    let trialDays = b.trial_days === undefined || b.trial_days === '' ? Number(settings.trial_days) : Number(b.trial_days);
    if (!(trialDays >= 0 && trialDays <= 365)) return err('ট্রায়ালের দিন ০ থেকে ৩৬৫ এর মধ্যে হতে হবে', 400);
    const now = new Date();
    const trialEnd = trialDays > 0 ? trialEndDate({ trial_days: trialDays }, now) : now.toISOString();

    const { salt, hash } = await createPasswordRecord(password);
    const slug = await uniqueSlug(env, b.slug || profile.data.store_name, 0, username);
    let id;
    try {
      const res = await env.DB.prepare(
        `INSERT INTO sellers (seller_code, username, slug, password_hash, password_salt, name, store_name, phone, email, address, logo, description, status, trial_ends_at, commission_percent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind('TMP-' + randomToken(6), username, slug, hash, salt, profile.data.name, profile.data.store_name, profile.data.phone || null,
        profile.data.email || null, profile.data.address || null, profile.data.logo || null, profile.data.description || null, status, trialEnd,
        Number(settings.default_commission_percent) || 0).run();
      id = res.meta.last_row_id;
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) return err('এই ইউজারনেম/স্টোর লিংক আগে থেকেই আছে', 409);
      throw e;
    }
    await env.DB.prepare('UPDATE sellers SET seller_code = ? WHERE id = ?').bind(sellerCodeFor(id), id).run();
    if (trialDays > 0) {
      await recordSubscription(env, { sellerId: id, kind: 'trial', startsAt: now.toISOString(), endsAt: trialEnd, note: `${trialDays} দিনের ফ্রি ট্রায়াল`, by: 'system' });
    }

    const seller = await getSeller(env, id);
    return json({
      ok: true, id, seller: publicSeller(seller), subscription: computeSubscription(seller, settings),
      ...(generated ? { generated_password: generated, notice: 'এই পাসওয়ার্ড শুধু এখনই দেখানো হচ্ছে — সেলারকে জানিয়ে দিন, পরে আর দেখা যাবে না' } : {}),
    }, 201);
  } catch (e) {
    return err('সেলার তৈরি করা যায়নি: ' + e.message, 500);
  }
}
