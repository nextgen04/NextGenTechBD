// GET /api/banners — পাবলিক এন্ডপয়েন্ট, হোমপেজে দেখানোর জন্য সক্রিয় ব্যানার/স্লাইডার
import { json, err } from '../_lib/utils.js';

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const res = await env.DB.prepare(
      `SELECT id, title, subtitle, img, button_text, button_url FROM banners
       WHERE active = 1
         AND (start_date IS NULL OR start_date <= date('now'))
         AND (end_date IS NULL OR end_date >= date('now'))
       ORDER BY sort_order ASC, id ASC`
    ).all();
    return json({ banners: res.results || [] });
  } catch (e) {
    return err('ব্যানার লোড করা যায়নি: ' + e.message, 500);
  }
}
