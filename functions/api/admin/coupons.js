// /api/admin/coupons — অ্যাডমিন প্যানেলে কুপন ও অফার ম্যানেজমেন্ট (X-Admin-Key হেডার লাগবে)
// GET    → সব কুপনের তালিকা
// POST   → নতুন কুপন তৈরি অথবা (body.id দিলে) বিদ্যমান কুপন আপডেট
// DELETE → ?id=123 দিয়ে কুপন মুছে ফেলা
import { json, err, toBool } from '../../_lib/utils.js';
import { requireAdmin } from '../../_lib/auth.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  try {
    const res = await env.DB.prepare(
      `SELECT c.id, c.code, c.type, c.value, c.min_purchase, c.cat, c.product_id, c.start_date, c.end_date, c.usage_limit, c.used_count, c.first_order_only, c.free_shipping, c.active, c.created_at, c.seller_id,
              (SELECT store_name FROM sellers s WHERE s.id = c.seller_id) AS seller_name
       FROM coupons c ORDER BY c.id DESC`
    ).all();
    return json({ coupons: res.results || [] });
  } catch (e) {
    return err('কুপন লোড করা যায়নি: ' + e.message, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  try {
    const b = await request.json();
    if (!b.code || !b.type || b.value === undefined) return err('কোড, টাইপ ও ভ্যালু আবশ্যক', 400);
    if (!['percent', 'fixed'].includes(b.type)) return err('টাইপ percent অথবা fixed হতে হবে', 400);

    const code = String(b.code).trim().toUpperCase();
    if (!/^[A-Z0-9_-]{2,30}$/.test(code)) return err('কুপন কোডে শুধু ইংরেজি অক্ষর, সংখ্যা, - ও _ ব্যবহার করুন (২–৩০ অক্ষর)', 400);
    const value = Number(b.value);
    if (!Number.isFinite(value) || value <= 0 || (b.type === 'percent' && value > 100)) return err('ভ্যালু সঠিক নয় (শতাংশ হলে ১–১০০)', 400);
    // seller_id: খালি/null = গ্লোবাল কুপন; সংখ্যা = শুধু ওই সেলারের পণ্যের উপর (সেলার অবশ্যই বিদ্যমান ও মুছে-ফেলা নয়)
    let sellerId = null;
    if (b.seller_id !== undefined && b.seller_id !== null && b.seller_id !== '') {
      sellerId = Number(b.seller_id);
      const sl = Number.isInteger(sellerId) ? await env.DB.prepare('SELECT id FROM sellers WHERE id = ? AND deleted_at IS NULL').bind(sellerId).first() : null;
      if (!sl) return err('সেলার পাওয়া যায়নি', 400);
    }
    const fields = [
      code, b.type, value, Number(b.min_purchase) || 0,
      b.cat || null, b.product_id ? Number(b.product_id) : null,
      b.start_date || null, b.end_date || null,
      b.usage_limit ? Number(b.usage_limit) : null,
      toBool(b.first_order_only) ? 1 : 0, toBool(b.free_shipping) ? 1 : 0,
      toBool(b.active) ? 1 : 0, sellerId,
    ];

    if (b.id) {
      await env.DB.prepare(
        `UPDATE coupons SET code=?, type=?, value=?, min_purchase=?, cat=?, product_id=?, start_date=?, end_date=?, usage_limit=?, first_order_only=?, free_shipping=?, active=?, seller_id=? WHERE id=?`
      ).bind(...fields, Number(b.id)).run();
      return json({ ok: true, id: Number(b.id) });
    } else {
      const res = await env.DB.prepare(
        `INSERT INTO coupons (code, type, value, min_purchase, cat, product_id, start_date, end_date, usage_limit, first_order_only, free_shipping, active, seller_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(...fields).run();
      return json({ ok: true, id: res.meta.last_row_id });
    }
  } catch (e) {
    const msg = e.message && e.message.includes('UNIQUE') ? 'এই কোডের একটা কুপন আগে থেকেই আছে' : e.message;
    return err('কুপন সংরক্ষণ করা যায়নি: ' + msg, 500);
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return err('id প্যারামিটার আবশ্যক', 400);
    await env.DB.prepare('DELETE FROM coupons WHERE id = ?').bind(Number(id)).run();
    return json({ ok: true });
  } catch (e) {
    return err('কুপন মুছা যায়নি: ' + e.message, 500);
  }
}
