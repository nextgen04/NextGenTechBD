// /api/reviews — পাবলিক এন্ডপয়েন্ট
// GET  → ?product_id=123 দিয়ে সেই পণ্যের অনুমোদিত (approved) রিভিউ
// POST → নতুন রিভিউ জমা দেওয়া (অ্যাডমিন অনুমোদনের আগ পর্যন্ত সাইটে দেখা যাবে না)
import { json, err } from '../_lib/utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  try {
    const productId = new URL(request.url).searchParams.get('product_id');
    if (!productId) return err('product_id প্যারামিটার আবশ্যক', 400);
    const res = await env.DB.prepare(
      `SELECT id, customer_name, rating, comment, featured, created_at FROM reviews
       WHERE product_id = ? AND status = 'approved' ORDER BY featured DESC, id DESC LIMIT 100`
    ).bind(Number(productId)).all();
    return json({ reviews: res.results || [] });
  } catch (e) {
    return err('রিভিউ লোড করা যায়নি: ' + e.message, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const b = await request.json();
    const productId = Number(b.product_id);
    const rating = Number(b.rating);
    if (!productId) return err('product_id আবশ্যক', 400);
    if (!b.customer_name || !String(b.customer_name).trim()) return err('নাম দিন', 400);
    if (!rating || rating < 1 || rating > 5) return err('রেটিং ১ থেকে ৫ এর মধ্যে দিন', 400);

    const product = await env.DB.prepare('SELECT id FROM products WHERE id = ?').bind(productId).first();
    if (!product) return err('পণ্য পাওয়া যায়নি', 404);

    await env.DB.prepare(
      `INSERT INTO reviews (product_id, customer_name, rating, comment, status) VALUES (?, ?, ?, ?, 'pending')`
    )
      .bind(productId, String(b.customer_name).trim().slice(0, 80), rating, (b.comment || '').toString().slice(0, 1000) || null)
      .run();

    return json({ ok: true, message: 'রিভিউ জমা হয়েছে — অ্যাডমিন অনুমোদনের পর এটা পণ্যের পাতায় দেখা যাবে' });
  } catch (e) {
    return err('রিভিউ জমা করা যায়নি: ' + e.message, 500);
  }
}
