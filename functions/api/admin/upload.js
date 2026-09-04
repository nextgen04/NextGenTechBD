// POST /api/admin/upload — অ্যাডমিন প্যানেল থেকে পণ্যের ছবি আপলোড (X-Admin-Key হেডার লাগবে)
// ছবি কোনো আলাদা স্টোরেজ সার্ভিসে (R2/S3 ইত্যাদি) না গিয়ে সরাসরি GitHub রিপোজিটরিতে কমিট হয়
// (public/uploads/products/ ফোল্ডারে) — তাই কোনো কার্ড/বিলিং সেটআপ লাগে না।
// কমিট হওয়ার সাথে সাথেই Cloudflare Pages স্বয়ংক্রিয়ভাবে নতুন ডিপ্লয় শুরু করে (রিপোর সাথে যুক্ত থাকায়),
// তাই ছবিটা লাইভ সাইটে দেখা যেতে সাধারণত ১-২ মিনিট সময় লাগে।
import { json, err, requireAdmin } from '../../_lib/utils.js';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 2 * 1024 * 1024; // ২MB — GitHub রিপোতে কমিট হওয়ায় ছবি ছোট/কম্প্রেসড রাখা ভালো

function toBase64(buf) {
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH } = env;
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    return err(
      'GitHub ছবি আপলোড কনফিগার করা নেই — Cloudflare Pages → Settings → Environment variables এ GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO যোগ করুন',
      500
    );
  }
  const branch = GITHUB_BRANCH || 'main';

  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') return err('কোনো ছবি পাওয়া যায়নি', 400);
    if (!ALLOWED_TYPES.includes(file.type)) return err('শুধু JPG, PNG, WEBP অথবা GIF ছবি আপলোড করা যাবে', 400);
    if (file.size > MAX_BYTES) return err('ছবির আকার সর্বোচ্চ ২MB হতে পারবে (GitHub-এ কমিট হওয়ায় ছোট ছবি রাখতে হবে)', 400);

    const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const repoPath = `public/uploads/products/${filename}`;
    const base64Content = toBase64(await file.arrayBuffer());

    const ghRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${repoPath}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          'User-Agent': 'nextgentechbd-admin-panel',
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `পণ্যের ছবি আপলোড: ${filename}`,
          content: base64Content,
          branch,
        }),
      }
    );

    if (!ghRes.ok) {
      const t = await ghRes.text().catch(() => '');
      let hint = '';
      if (ghRes.status === 401) hint = ' (GITHUB_TOKEN ভুল বা মেয়াদ শেষ হতে পারে)';
      if (ghRes.status === 404) hint = ' (GITHUB_OWNER/GITHUB_REPO নাম ভুল হতে পারে, অথবা টোকেনে এই রিপোর অনুমতি নেই)';
      return err('GitHub-এ ছবি কমিট করা যায়নি (HTTP ' + ghRes.status + ')' + hint, 500);
    }

    return json({
      ok: true,
      url: '/uploads/products/' + filename,
      note: 'ছবি GitHub-এ কমিট হয়েছে — Cloudflare Pages রিডেপ্লয় শেষ হলে (সাধারণত ১-২ মিনিট) সাইটে দেখা যাবে।',
    });
  } catch (e) {
    return err('ছবি আপলোড করা যায়নি: ' + e.message, 500);
  }
}
