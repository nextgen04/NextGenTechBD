// POST /api/admin/upload — অ্যাডমিন প্যানেল থেকে পণ্যের ছবি আপলোড (X-Admin-Key হেডার লাগবে)
// ছবি সরাসরি Cloudinary-তে (ফ্রি ক্লাউড ইমেজ হোস্টিং + CDN, কার্ড লাগে না) আপলোড হয় এবং তাৎক্ষণিক লাইভ হয়ে যায় —
// কোনো GitHub কমিট, রিডেপ্লয়, বা অপেক্ষা লাগে না।
// দুই ধরনের Cloudinary কনফিগ সাপোর্ট করে:
//  ১) Unsigned: CLOUDINARY_CLOUD_NAME + CLOUDINARY_UPLOAD_PRESET (সহজ, Cloudinary Settings → Upload → Upload presets এ "Unsigned" মোডে একটা preset বানাতে হবে)
//  ২) Signed: CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET
import { json, err, requireAdmin } from '../../_lib/utils.js';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 5 * 1024 * 1024; // ৫MB

async function sha1Hex(str) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-1', enc.encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, CLOUDINARY_UPLOAD_PRESET } = env;
  const hasSigned = CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET;
  const hasUnsigned = CLOUDINARY_CLOUD_NAME && CLOUDINARY_UPLOAD_PRESET;

  if (!hasSigned && !hasUnsigned) {
    return err(
      'Cloudinary কনফিগার করা নেই — Cloudflare Pages → Settings → Environment variables এ CLOUDINARY_CLOUD_NAME ও CLOUDINARY_UPLOAD_PRESET (অথবা CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET) যোগ করুন',
      500
    );
  }

  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') return err('কোনো ছবি পাওয়া যায়নি', 400);
    if (!ALLOWED_TYPES.includes(file.type)) return err('শুধু JPG, PNG, WEBP অথবা GIF ছবি আপলোড করা যাবে', 400);
    if (file.size > MAX_BYTES) return err('ছবির আকার সর্বোচ্চ ৫MB হতে পারবে', 400);

    const folder = 'nextgentechbd/products';
    const cloudForm = new FormData();
    cloudForm.append('file', file);
    cloudForm.append('folder', folder);

    if (hasUnsigned) {
      // Unsigned upload — কোনো সিগনেচার লাগে না, Cloudinary-তে preset-টা "Unsigned" মোডে থাকতেই হবে
      cloudForm.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    } else {
      // Signed upload — সার্ভার-সাইডে সিগনেচার তৈরি করা হয়
      const timestamp = Math.floor(Date.now() / 1000);
      const toSign = `folder=${folder}&timestamp=${timestamp}`;
      const signature = await sha1Hex(toSign + CLOUDINARY_API_SECRET);
      cloudForm.append('api_key', CLOUDINARY_API_KEY);
      cloudForm.append('timestamp', String(timestamp));
      cloudForm.append('signature', signature);
    }

    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body: cloudForm,
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = (data && data.error && data.error.message) || 'HTTP ' + res.status;
      return err('Cloudinary-তে ছবি আপলোড করা যায়নি: ' + msg, 500);
    }

    return json({ ok: true, url: data.secure_url });
  } catch (e) {
    return err('ছবি আপলোড করা যায়নি: ' + e.message, 500);
  }
}
