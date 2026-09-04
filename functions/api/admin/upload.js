// POST /api/admin/upload — অ্যাডমিন প্যানেল থেকে পণ্যের ছবি আপলোড (X-Admin-Key হেডার লাগবে)
// multipart/form-data দিয়ে একটা ফাইল ('file' ফিল্ড নামে) গ্রহণ করে R2 বাকেটে সংরক্ষণ করে,
// এবং একটা পাবলিক URL ফেরত দেয় (/images/products/...) যা সরাসরি পণ্যের 'ছবি' হিসেবে ব্যবহার করা যায়।
import { json, err, requireAdmin } from '../../_lib/utils.js';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 4 * 1024 * 1024; // ৪MB

export async function onRequestPost(context) {
  const { request, env } = context;
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  if (!env.IMAGES) {
    return err('R2 বাকেট (IMAGES) বাইন্ড করা নেই — Cloudflare Pages → Settings → Functions → R2 bucket bindings এ যোগ করুন', 500);
  }

  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') return err('কোনো ছবি পাওয়া যায়নি', 400);
    if (!ALLOWED_TYPES.includes(file.type)) return err('শুধু JPG, PNG, WEBP অথবা GIF ছবি আপলোড করা যাবে', 400);
    if (file.size > MAX_BYTES) return err('ছবির আকার সর্বোচ্চ ৪MB হতে পারবে', 400);

    const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const key = `products/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    await env.IMAGES.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
    });

    return json({ ok: true, url: '/images/' + key });
  } catch (e) {
    return err('ছবি আপলোড করা যায়নি: ' + e.message, 500);
  }
}
