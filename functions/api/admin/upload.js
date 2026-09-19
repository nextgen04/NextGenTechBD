// POST /api/admin/upload — অ্যাডমিন প্যানেল থেকে পণ্যের ছবি আপলোড (X-Admin-Key হেডার লাগবে)
// ছবি Cloudinary-তে আপলোড হয় (Unsigned Upload Preset পদ্ধতিতে) — তাই GitHub-এ কমিট/রিডেপ্লয়
// করার দরকার নেই, আপলোড করলেই সাথে সাথে ছবির লিংক পাওয়া যায় এবং সাইটে দেখা যায়।
import { json, err, requireAdmin } from '../../_lib/utils.js';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 8 * 1024 * 1024; // ৮MB — Cloudinary নিজে থেকেই ছবি অপটিমাইজ/কম্প্রেস করে দেয়

export async function onRequestPost(context) {
  const { request, env } = context;
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } = env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
    return err(
      'Cloudinary ছবি আপলোড কনফিগার করা নেই — Cloudflare Pages → Settings → Environment variables এ CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET যোগ করুন',
      500
    );
  }

  try {
    const incoming = await request.formData();
    const file = incoming.get('file');
    if (!file || typeof file === 'string') return err('কোনো ছবি পাওয়া যায়নি', 400);
    if (!ALLOWED_TYPES.includes(file.type)) return err('শুধু JPG, PNG, WEBP অথবা GIF ছবি আপলোড করা যাবে', 400);
    if (file.size > MAX_BYTES) return err('ছবির আকার সর্বোচ্চ ৮MB হতে পারবে', 400);

    const cloudinaryForm = new FormData();
    cloudinaryForm.append('file', file);
    cloudinaryForm.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    cloudinaryForm.append('folder', 'nextgentechbd/products');

    const cdRes = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: 'POST', body: cloudinaryForm }
    );

    const cdData = await cdRes.json().catch(() => ({}));

    if (!cdRes.ok) {
      const hint = cdData?.error?.message || ('HTTP ' + cdRes.status);
      return err('Cloudinary-তে ছবি আপলোড করা যায়নি: ' + hint, 500);
    }

    return json({
      ok: true,
      url: cdData.secure_url,
      note: 'ছবি Cloudinary-তে আপলোড হয়েছে — সাথে সাথে সাইটে দেখা যাবে।',
    });
  } catch (e) {
    return err('ছবি আপলোড করা যায়নি: ' + e.message, 500);
  }
}
