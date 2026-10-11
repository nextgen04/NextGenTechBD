// GET /api/site-text — পাবলিক এন্ডপয়েন্ট, হোমপেজের সম্পাদনাযোগ্য সেকশন-শিরোনাম ফেরত দেয়
import { json, err } from '../_lib/utils.js';

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const res = await env.DB.prepare('SELECT key, value FROM site_text').all();
    const out = {};
    (res.results || []).forEach((row) => { out[row.key] = row.value; });
    return json(out);
  } catch (e) {
    console.error('site-text failed:', e && e.message);
    return err('টেক্সট লোড করা যায়নি', 500);
  }
}
