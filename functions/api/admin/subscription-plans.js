// /api/admin/subscription-plans — Super Admin: সাবস্ক্রিপশন প্ল্যান ম্যানেজমেন্ট
// GET    → সব প্ল্যান (নিষ্ক্রিয়সহ) ও প্রতিটির ব্যবহারকারী সংখ্যা
// POST   → নতুন প্ল্যান অথবা (body.id দিলে) আপডেট: { name, price, duration_days, product_limit?, description?, active?, sort_order? }
// DELETE → ?id= — কোনো সেলার ব্যবহার করে থাকলে মোছা হয় না, শুধু নিষ্ক্রিয় হয়
import { json, err, toBool } from '../../_lib/utils.js';
import { requireAdmin } from '../../_lib/auth.js';
import { cleanText, parseId } from '../../_lib/sellers.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  try {
    const res = await env.DB.prepare(
      `SELECT p.id, p.name, p.price, p.duration_days, p.product_limit, p.description, p.active, p.sort_order,
              (SELECT COUNT(*) FROM sellers s WHERE s.subscription_plan_id = p.id AND s.deleted_at IS NULL) AS sellers
       FROM subscription_plans p ORDER BY p.sort_order ASC, p.id ASC`
    ).all();
    return json({ plans: res.results || [] });
  } catch (e) {
    return err('প্ল্যান লোড করা যায়নি: ' + e.message, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  try {
    const b = await request.json().catch(() => ({}));
    const name = cleanText(b.name, 60);
    if (name.length < 2 || /[<>]/.test(name)) return err('প্ল্যানের নাম সঠিক নয়', 400);
    const price = Number(b.price);
    const days = Number(b.duration_days);
    if (!Number.isInteger(price) || price < 0) return err('দাম ০ বা তার বেশি পূর্ণসংখ্যা হতে হবে', 400);
    if (!Number.isInteger(days) || days < 1 || days > 3650) return err('মেয়াদ ১ থেকে ৩৬৫০ দিনের মধ্যে হতে হবে', 400);
    let limit = null;
    if (b.product_limit !== undefined && b.product_limit !== null && b.product_limit !== '') {
      limit = Number(b.product_limit);
      if (!Number.isInteger(limit) || limit < 1) return err('পণ্যের সীমা ১ বা তার বেশি হতে হবে (খালি = আনলিমিটেড)', 400);
    }
    const desc = cleanText(b.description, 300) || null;
    if (desc && /[<>]/.test(desc)) return err('বিবরণে < বা > ব্যবহার করা যাবে না', 400);
    const active = b.active === undefined ? 1 : toBool(b.active) ? 1 : 0;
    const sort = Number(b.sort_order) || 0;
    if (b.id) {
      const id = parseId(b.id);
      const r = await env.DB.prepare(
        `UPDATE subscription_plans SET name=?, price=?, duration_days=?, product_limit=?, description=?, active=?, sort_order=?, updated_at=datetime('now') WHERE id=?`
      ).bind(name, price, days, limit, desc, active, sort, id).run();
      if (!r.meta.changes) return err('প্ল্যান পাওয়া যায়নি', 404);
      return json({ ok: true, id });
    }
    const r = await env.DB.prepare(
      'INSERT INTO subscription_plans (name, price, duration_days, product_limit, description, active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(name, price, days, limit, desc, active, sort).run();
    return json({ ok: true, id: r.meta.last_row_id }, 201);
  } catch (e) {
    return err('প্ল্যান সংরক্ষণ করা যায়নি: ' + e.message, 500);
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  try {
    const id = parseId(new URL(request.url).searchParams.get('id'));
    if (!id) return err('id প্যারামিটার আবশ্যক', 400);
    const used = await env.DB.prepare(
      'SELECT (SELECT COUNT(*) FROM sellers WHERE subscription_plan_id = ?) + (SELECT COUNT(*) FROM seller_subscriptions WHERE plan_id = ?) AS c'
    ).bind(id, id).first();
    if (used && used.c > 0) {
      await env.DB.prepare(`UPDATE subscription_plans SET active = 0, updated_at = datetime('now') WHERE id = ?`).bind(id).run();
      return json({ ok: true, deactivated: true, message: 'প্ল্যানটি ব্যবহৃত হয়েছে, তাই মোছা হয়নি — শুধু নিষ্ক্রিয় করা হয়েছে' });
    }
    await env.DB.prepare('DELETE FROM subscription_plans WHERE id = ?').bind(id).run();
    return json({ ok: true, deleted: true });
  } catch (e) {
    return err('প্ল্যান মুছা যায়নি: ' + e.message, 500);
  }
}
