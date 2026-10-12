// /api/seller/upload — Seller-ভিত্তিক Cloudinary ছবি ব্যবস্থাপনা (বিদ্যমান /api/admin/upload অপরিবর্তিত)
// POST   (multipart file) → ছবি আপলোড; প্রতিটি Seller-এর ছবি আলাদা ফোল্ডারে: nextgentechbd/sellers/<seller_id>/products
// GET    → নিজের ফোল্ডারের ছবির তালিকা   (শুধু Signed কনফিগ: CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET থাকলে)
// DELETE → ?public_id=… নিজের ফোল্ডারের ছবি মোছা (কোনো পণ্যে ব্যবহার হলে মোছা যায় না)
// পারমিশন: can_product_create অথবা can_product_edit
import { json, err } from '../../_lib/utils.js';
import { requireSeller, can, forbidden } from '../../_lib/seller.js';
import { rateLimit } from '../../_lib/ratelimit.js';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 5 * 1024 * 1024;
const folderOf = (id) => `nextgentechbd/sellers/${id}/products`;

async function sha1Hex(str) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const allowed = (s) => can(s, 'can_product_create') || can(s, 'can_product_edit');

export async function onRequestPost(context) {
  const { request, env } = context;
  const { seller, denied } = await requireSeller(request, env);
  if (denied) return denied;
  if (!allowed(seller)) return forbidden('can_product_create');
  const limited = await rateLimit(env, request, 'seller-upload', 40, 10 * 60, String(seller.id), false);
  if (limited) return limited;

  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, CLOUDINARY_UPLOAD_PRESET } = env;
  const hasSigned = CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET;
  const hasUnsigned = CLOUDINARY_CLOUD_NAME && CLOUDINARY_UPLOAD_PRESET;
  if (!hasSigned && !hasUnsigned) return err('Cloudinary কনফিগার করা নেই — Super Admin-এর সাথে যোগাযোগ করুন', 500);

  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') return err('কোনো ছবি পাওয়া যায়নি', 400);
    if (!ALLOWED_TYPES.includes(file.type)) return err('শুধু JPG, PNG, WEBP অথবা GIF ছবি আপলোড করা যাবে', 400);
    if (file.size > MAX_BYTES) return err('ছবির আকার সর্বোচ্চ ৫MB হতে পারবে', 400);

    const folder = folderOf(seller.id); // ফোল্ডার সবসময় সার্ভারে ঠিক হয় — ক্লায়েন্ট বদলাতে পারে না
    const cloudForm = new FormData();
    cloudForm.append('file', file);
    cloudForm.append('folder', folder);
    if (hasSigned) {
      const timestamp = Math.floor(Date.now() / 1000);
      cloudForm.append('api_key', CLOUDINARY_API_KEY);
      cloudForm.append('timestamp', String(timestamp));
      cloudForm.append('signature', await sha1Hex(`folder=${folder}&timestamp=${timestamp}` + CLOUDINARY_API_SECRET));
    } else {
      cloudForm.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    }
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: cloudForm });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return err('Cloudinary-তে ছবি আপলোড করা যায়নি: ' + ((data && data.error && data.error.message) || 'HTTP ' + res.status), 500);
    return json({ ok: true, url: data.secure_url, public_id: data.public_id });
  } catch (e) {
    console.error('seller/upload failed:', e && e.message);
    return err('ছবি আপলোড করা যায়নি', 500);
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const { seller, denied } = await requireSeller(request, env);
  if (denied) return denied;
  if (!allowed(seller)) return forbidden('can_product_create');
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = env;
  if (!(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET)) {
    return err('ছবির তালিকা দেখতে Cloudinary API Key/Secret কনফিগার থাকতে হবে (Super Admin সেট করবেন)', 501);
  }
  try {
    const prefix = encodeURIComponent(folderOf(seller.id) + '/');
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/resources/image/upload?prefix=${prefix}&max_results=100`, {
      headers: { Authorization: 'Basic ' + btoa(`${CLOUDINARY_API_KEY}:${CLOUDINARY_API_SECRET}`) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return err('ছবির তালিকা আনা যায়নি', 502);
    const images = (data.resources || []).map((r) => ({ public_id: r.public_id, url: r.secure_url, bytes: r.bytes, created_at: r.created_at }));
    return json({ images });
  } catch (e) {
    console.error('seller/upload GET failed:', e && e.message);
    return err('ছবির তালিকা আনা যায়নি', 500);
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const { seller, denied } = await requireSeller(request, env);
  if (denied) return denied;
  if (!allowed(seller)) return forbidden('can_product_create');
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = env;
  if (!(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET)) {
    return err('ছবি মুছতে Cloudinary API Key/Secret কনফিগার থাকতে হবে (Super Admin সেট করবেন)', 501);
  }
  try {
    const pid = new URL(request.url).searchParams.get('public_id') || '';
    // 🔒 শুধু নিজের ফোল্ডারের ছবি (অন্য Seller বা প্ল্যাটফর্মের ছবি নয়)
    const re = new RegExp(`^nextgentechbd/sellers/${seller.id}/products/[A-Za-z0-9_-]+$`);
    if (!re.test(pid)) return err('এই ছবি মোছার অনুমতি নেই', 403);
    const used = await env.DB.prepare("SELECT id FROM products WHERE img LIKE ? LIMIT 1").bind('%' + pid + '.%').first();
    if (used) return err('এই ছবিটি একটি পণ্যে ব্যবহার হচ্ছে — আগে পণ্যের ছবি বদলান', 409);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await sha1Hex(`public_id=${pid}&timestamp=${timestamp}` + CLOUDINARY_API_SECRET);
    const f = new FormData();
    f.append('public_id', pid); f.append('api_key', CLOUDINARY_API_KEY); f.append('timestamp', String(timestamp)); f.append('signature', signature);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/destroy`, { method: 'POST', body: f });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || (data.result && data.result !== 'ok')) return err('ছবি মোছা যায়নি', 502);
    return json({ ok: true });
  } catch (e) {
    console.error('seller/upload DELETE failed:', e && e.message);
    return err('ছবি মোছা যায়নি', 500);
  }
}
