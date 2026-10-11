// Cloudinary ইমেজ আপলোড — Super Admin ও Seller দুজনের আপলোড endpoint এই একটি কোড ব্যবহার করে।
// কনফিগ: Unsigned (CLOUDINARY_CLOUD_NAME + CLOUDINARY_UPLOAD_PRESET) অথবা Signed (CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET)
import { json, err } from './utils.js';

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // ৫MB

async function sha1Hex(str) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function uploadImageFromRequest(request, env, folder) {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, CLOUDINARY_UPLOAD_PRESET } = env;
  const hasSigned = CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET;
  const hasUnsigned = CLOUDINARY_CLOUD_NAME && CLOUDINARY_UPLOAD_PRESET;
  if (!hasSigned && !hasUnsigned) {
    return err('Cloudinary কনফিগার করা নেই — Cloudflare Pages → Settings → Environment variables এ CLOUDINARY_CLOUD_NAME ও CLOUDINARY_UPLOAD_PRESET (অথবা CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET) যোগ করুন', 500);
  }
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') return err('কোনো ছবি পাওয়া যায়নি', 400);
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return err('শুধু JPG, PNG, WEBP অথবা GIF ছবি আপলোড করা যাবে', 400);
    if (file.size > MAX_IMAGE_BYTES) return err('ছবির আকার সর্বোচ্চ ৫MB হতে পারবে', 400);

    const cloudForm = new FormData();
    cloudForm.append('file', file);
    cloudForm.append('folder', folder);
    if (hasUnsigned) {
      cloudForm.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    } else {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = await sha1Hex(`folder=${folder}&timestamp=${timestamp}` + CLOUDINARY_API_SECRET);
      cloudForm.append('api_key', CLOUDINARY_API_KEY);
      cloudForm.append('timestamp', String(timestamp));
      cloudForm.append('signature', signature);
    }
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: cloudForm });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return err('Cloudinary-তে ছবি আপলোড করা যায়নি: ' + ((data && data.error && data.error.message) || 'HTTP ' + res.status), 500);
    return json({ ok: true, url: data.secure_url });
  } catch (e) {
    return err('ছবি আপলোড করা যায়নি: ' + e.message, 500);
  }
}
