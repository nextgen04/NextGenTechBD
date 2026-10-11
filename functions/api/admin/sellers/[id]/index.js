// /api/admin/sellers/:id — Super Admin: সেলারের বিস্তারিত (পণ্য, অর্ডার, সেলস, স্টক, সাবস্ক্রিপশন), সম্পাদনা, ডিলিট (deactivate)
import { json, err } from '../../../../_lib/utils.js';
import { requireAdmin, publicSeller, revokeSellerSessions, validateUsername } from '../../../../_lib/auth.js';
import { getMarketplaceSettings, computeSubscription } from '../../../../_lib/subscription.js';
import { getSeller, salesSummary, validateProfile, uniqueSlug, parseId, isReservedUsername, slugify } from '../../../../_lib/sellers.js';

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const id = parseId(params.id);
  if (!id) return err('সঠিক সেলার আইডি দিন', 400);
  try {
    const seller = await getSeller(env, id);
    if (!seller) return err('সেলার পাওয়া যায়নি', 404);
    const settings = await getMarketplaceSettings(env);
    const [products, stockAgg, orderAgg, sales, orders, lowStock, subs, logins] = await Promise.all([
      env.DB.prepare('SELECT id, name, cat, price, stock, low_stock_at, status, img, sku FROM products WHERE seller_id = ? ORDER BY id DESC LIMIT 300').bind(id).all(),
      env.DB.prepare(
        `SELECT COUNT(*) AS total, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active,
                COALESCE(SUM(stock),0) AS units, SUM(CASE WHEN stock IS NOT NULL AND stock <= 0 THEN 1 ELSE 0 END) AS out_of_stock,
                SUM(CASE WHEN stock IS NOT NULL AND stock > 0 AND stock <= low_stock_at THEN 1 ELSE 0 END) AS low_stock
         FROM products WHERE seller_id = ?`).bind(id).first(),
      env.DB.prepare(
        `SELECT COUNT(DISTINCT order_id) AS total,
                COUNT(DISTINCT CASE WHEN seller_status IN ('pending','processing','confirmed') THEN order_id END) AS pending,
                COUNT(DISTINCT CASE WHEN seller_status = 'delivered' THEN order_id END) AS completed
         FROM order_items WHERE seller_id = ?`).bind(id).first(),
      salesSummary(env, id),
      env.DB.prepare(
        `SELECT oi.id, o.order_no, o.name AS customer_name, o.phone AS customer_phone, oi.product_name_snapshot, oi.quantity, oi.subtotal, oi.seller_status, oi.created_at
         FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.seller_id = ? ORDER BY oi.id DESC LIMIT 100`).bind(id).all(),
      env.DB.prepare('SELECT id, name, stock, low_stock_at FROM products WHERE seller_id = ? AND stock IS NOT NULL AND stock <= low_stock_at ORDER BY stock ASC LIMIT 20').bind(id).all(),
      env.DB.prepare(
        `SELECT ss.id, ss.kind, ss.amount, ss.payment_method, ss.payment_ref, ss.starts_at, ss.ends_at, ss.note, ss.created_by, ss.created_at, p.name AS plan_name
         FROM seller_subscriptions ss LEFT JOIN subscription_plans p ON p.id = ss.plan_id WHERE ss.seller_id = ? ORDER BY ss.id DESC LIMIT 30`).bind(id).all(),
      env.DB.prepare('SELECT success, ip, created_at FROM seller_login_log WHERE seller_id = ? ORDER BY id DESC LIMIT 10').bind(id).all(),
    ]);
    return json({
      seller: { ...publicSeller(seller), commission_percent: seller.commission_percent, is_system: seller.is_system, deleted_at: seller.deleted_at, access_override: seller.access_override },
      subscription: computeSubscription(seller, settings),
      stats: { products: stockAgg, orders: orderAgg, sales },
      products: products.results || [], orders: orders.results || [], low_stock: lowStock.results || [],
      subscription_history: subs.results || [], recent_logins: logins.results || [],
    });
  } catch (e) {
    return err('সেলারের তথ্য লোড করা যায়নি: ' + e.message, 500);
  }
}

export async function onRequestPut(context) {
  const { request, env, params } = context;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const id = parseId(params.id);
  if (!id) return err('সঠিক সেলার আইডি দিন', 400);
  try {
    let b;
    try { b = await request.json(); } catch (e) { return err('অবৈধ রিকোয়েস্ট', 400); }
    const seller = await getSeller(env, id);
    if (!seller) return err('সেলার পাওয়া যায়নি', 404);
    if (seller.deleted_at) return err('ডিলিট করা সেলার এডিট করা যাবে না', 400);

    const p = validateProfile(b, { partial: true });
    if (p.error) return err(p.error, 400);
    const sets = []; const binds = [];
    for (const [k, v] of Object.entries(p.data)) { sets.push(`${k} = ?`); binds.push(v); }

    if (b.username !== undefined) {
      const u = String(b.username).trim().toLowerCase();
      if (u !== seller.username) {
        if (seller.is_system) return err('সিস্টেম সেলারের ইউজারনেম বদলানো যাবে না', 400);
        if (!validateUsername(u) || isReservedUsername(u)) return err('ইউজারনেম সঠিক নয় বা সংরক্ষিত', 400);
        const dup = await env.DB.prepare('SELECT id FROM sellers WHERE username = ? AND id != ?').bind(u, id).first();
        if (dup) return err('এই ইউজারনেমটি আগে থেকেই আছে', 409);
        sets.push('username = ?'); binds.push(u);
      }
    }
    if (b.slug !== undefined) {
      const s = slugify(b.slug);
      if (!s) return err('স্টোর লিংক সঠিক নয় (a-z, 0-9, -)', 400);
      if (s !== seller.slug) {
        if (seller.is_system) return err('সিস্টেম সেলারের স্টোর লিংক বদলানো যাবে না', 400);
        const dup = await env.DB.prepare('SELECT id FROM sellers WHERE slug = ? AND id != ?').bind(s, id).first();
        if (dup) return err('এই স্টোর লিংক আগে থেকেই আছে', 409);
        sets.push('slug = ?'); binds.push(s);
      }
    }
    if (!sets.length) return err('আপডেট করার মতো কোনো তথ্য দেওয়া হয়নি', 400);
    sets.push("updated_at = datetime('now')");
    await env.DB.prepare(`UPDATE sellers SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, id).run();
    return json({ ok: true, seller: publicSeller(await getSeller(env, id)) });
  } catch (e) {
    return err('আপডেট করা যায়নি: ' + e.message, 500);
  }
}

// ডিলিট = soft delete (deactivate): লগইন বন্ধ, সব সেশন বাতিল, পণ্য/অর্ডারের ইতিহাস অক্ষত থাকে।
export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const id = parseId(params.id);
  if (!id) return err('সঠিক সেলার আইডি দিন', 400);
  try {
    const seller = await getSeller(env, id);
    if (!seller) return err('সেলার পাওয়া যায়নি', 404);
    if (seller.is_system) return err('সিস্টেম সেলার (NextGenTechBD Official) ডিলিট করা যাবে না', 400);
    await env.DB.prepare(`UPDATE sellers SET deleted_at = datetime('now'), status = 'blocked', updated_at = datetime('now') WHERE id = ?`).bind(id).run();
    await revokeSellerSessions(env, id);
    return json({ ok: true, message: 'সেলার নিষ্ক্রিয় করা হয়েছে। এর পণ্যগুলো অন্য সেলারে ট্রান্সফার করতে পারেন।' });
  } catch (e) {
    return err('ডিলিট করা যায়নি: ' + e.message, 500);
  }
}
