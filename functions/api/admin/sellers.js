// /api/admin/sellers — Super Admin: Seller তৈরি, নিয়ন্ত্রণ ও পারমিশন নির্ধারণ (X-Admin-Key হেডার লাগবে)
// GET    → সব Seller + পণ্য সংখ্যা + পারমিশন
// POST   → নতুন Seller { shop_name, email, password, owner_name?, phone?, permissions? }
// PATCH  → { id, shop_name?, owner_name?, phone?, notes?, status?('active'|'suspended'), permissions?{…}, password? }
//          বন্ধ (suspended) করলে বা পাসওয়ার্ড বদলালে Seller-এর সব লগইন সেশন সাথে সাথে বাতিল হয়
// DELETE → ?id=… শুধু যে Seller-এর কোনো পণ্য/অর্ডার নেই; নাহলে "বন্ধ করুন" (ডেটা নষ্ট হয় না)
import { json, err, requireAdmin, createPasswordRecord, normalizeEmail, EMAIL_RE } from '../../_lib/utils.js';
import { PERMISSIONS, publicSeller } from '../../_lib/seller.js';

const PHONE_RE = /^01[3-9]\d{8}$/;
const MIN_PW = 10;

function permValues(perms) {
  const p = perms && typeof perms === 'object' ? perms : {};
  return PERMISSIONS.map((k) => (p[k] === true || p[k] === 1 || p[k] === '1' ? 1 : 0));
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  try {
    const res = await env.DB.prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM products p WHERE p.seller_id = s.id) AS product_count,
              (SELECT COUNT(DISTINCT order_id) FROM order_items oi WHERE oi.seller_id = s.id) AS order_count
       FROM sellers s ORDER BY s.id DESC`
    ).all();
    const sellers = (res.results || []).map((s) => ({ ...publicSeller(s), notes: s.notes, created_at: s.created_at, product_count: s.product_count, order_count: s.order_count }));
    return json({ sellers });
  } catch (e) {
    console.error('admin/sellers GET failed:', e && e.message);
    return err('Seller তালিকা লোড করা যায়নি — migrations/009_multi_vendor.sql চালানো হয়েছে কি?', 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  try {
    let b;
    try { b = await request.json(); } catch (e) { return err('অনুরোধ সঠিক নয়', 400); }
    b = b || {};
    const shop = String(b.shop_name || '').trim();
    const email = normalizeEmail(b.email);
    const password = typeof b.password === 'string' ? b.password : '';
    const phone = String(b.phone || '').trim();
    if (shop.length < 2 || shop.length > 80) return err('দোকানের নাম ২–৮০ অক্ষরের হতে হবে', 400);
    if (!EMAIL_RE.test(email)) return err('সঠিক ইমেইল দিন', 400);
    if (password.length < MIN_PW || password.length > 200) return err(`পাসওয়ার্ড কমপক্ষে ${MIN_PW} ক্যারেক্টারের হতে হবে`, 400);
    if (phone && !PHONE_RE.test(phone)) return err('সঠিক মোবাইল নম্বর দিন (01XXXXXXXXX)', 400);

    const dup = await env.DB.prepare('SELECT id FROM sellers WHERE lower(email) = ?').bind(email).first();
    if (dup) return err('এই ইমেইল দিয়ে আগেই একজন Seller আছেন', 409);

    const { salt, hash } = await createPasswordRecord(password);
    const vals = permValues(b.permissions);
    const r = await env.DB.prepare(
      `INSERT INTO sellers (shop_name, owner_name, email, phone, password_hash, password_salt, status, ${PERMISSIONS.join(', ')}, notes)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ${PERMISSIONS.map(() => '?').join(', ')}, ?)`
    ).bind(shop, b.owner_name ? String(b.owner_name).trim().slice(0, 80) : null, email, phone || null, hash, salt, ...vals, b.notes ? String(b.notes).slice(0, 300) : null).run();
    return json({ ok: true, id: r.meta.last_row_id });
  } catch (e) {
    console.error('admin/sellers POST failed:', e && e.message);
    return err('Seller তৈরি করা যায়নি', 500);
  }
}

export async function onRequestPatch(context) {
  const { request, env } = context;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  try {
    let b;
    try { b = await request.json(); } catch (e) { return err('অনুরোধ সঠিক নয়', 400); }
    const id = Number(b && b.id);
    if (!Number.isInteger(id) || id <= 0) return err('id আবশ্যক', 400);
    const cur = await env.DB.prepare('SELECT id FROM sellers WHERE id = ?').bind(id).first();
    if (!cur) return err('Seller পাওয়া যায়নি', 404);

    const sets = [], binds = [];
    let killSessions = false;
    if (b.shop_name !== undefined) {
      const v = String(b.shop_name).trim();
      if (v.length < 2 || v.length > 80) return err('দোকানের নাম ২–৮০ অক্ষরের হতে হবে', 400);
      sets.push('shop_name = ?'); binds.push(v);
    }
    if (b.owner_name !== undefined) { sets.push('owner_name = ?'); binds.push(b.owner_name ? String(b.owner_name).trim().slice(0, 80) : null); }
    if (b.phone !== undefined) {
      const v = String(b.phone || '').trim();
      if (v && !PHONE_RE.test(v)) return err('সঠিক মোবাইল নম্বর দিন (01XXXXXXXXX)', 400);
      sets.push('phone = ?'); binds.push(v || null);
    }
    if (b.notes !== undefined) { sets.push('notes = ?'); binds.push(b.notes ? String(b.notes).slice(0, 300) : null); }
    if (b.status !== undefined) {
      if (!['active', 'suspended'].includes(b.status)) return err('status সঠিক নয়', 400);
      sets.push('status = ?'); binds.push(b.status);
      if (b.status === 'suspended') killSessions = true;
    }
    if (b.permissions !== undefined) {
      // শুধু যেগুলো পাঠানো হয়েছে সেগুলো বদলায়; বাকিগুলো যেমন ছিল তেমন
      for (const k of PERMISSIONS) {
        if (b.permissions && Object.prototype.hasOwnProperty.call(b.permissions, k)) {
          const v = b.permissions[k];
          sets.push(`${k} = ?`); binds.push(v === true || v === 1 || v === '1' ? 1 : 0);
        }
      }
    }
    if (b.password !== undefined) {
      const pw = typeof b.password === 'string' ? b.password : '';
      if (pw.length < MIN_PW || pw.length > 200) return err(`পাসওয়ার্ড কমপক্ষে ${MIN_PW} ক্যারেক্টারের হতে হবে`, 400);
      const { salt, hash } = await createPasswordRecord(pw);
      sets.push('password_hash = ?', 'password_salt = ?'); binds.push(hash, salt);
      killSessions = true;
    }
    if (!sets.length) return err('আপডেট করার মতো কোনো তথ্য দেওয়া হয়নি', 400);

    binds.push(id);
    await env.DB.prepare(`UPDATE sellers SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
    if (killSessions) await env.DB.prepare('DELETE FROM seller_sessions WHERE seller_id = ?').bind(id).run();
    return json({ ok: true });
  } catch (e) {
    console.error('admin/sellers PATCH failed:', e && e.message);
    return err('আপডেট করা যায়নি', 500);
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  try {
    const id = Number(new URL(request.url).searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) return err('id প্যারামিটার আবশ্যক', 400);
    const used = await env.DB.prepare(
      'SELECT (SELECT COUNT(*) FROM products WHERE seller_id = ?) AS p, (SELECT COUNT(*) FROM order_items WHERE seller_id = ?) AS o'
    ).bind(id, id).first();
    if (used && (used.p > 0 || used.o > 0)) {
      return err('এই Seller-এর পণ্য/অর্ডারের রেকর্ড আছে, তাই মুছা যাবে না — পরিবর্তে "বন্ধ করুন" (Suspend) ব্যবহার করুন', 409);
    }
    await env.DB.batch([
      env.DB.prepare('DELETE FROM seller_sessions WHERE seller_id = ?').bind(id),
      env.DB.prepare('DELETE FROM sellers WHERE id = ?').bind(id),
    ]);
    return json({ ok: true });
  } catch (e) {
    console.error('admin/sellers DELETE failed:', e && e.message);
    return err('মুছা যায়নি', 500);
  }
}
