// GET /api/seller/profile · PUT /api/seller/profile — নিজের স্টোরের তথ্য
// সেলার বদলাতে পারে: নাম, স্টোরের নাম, ফোন, ইমেইল, ঠিকানা, লোগো, বিবরণ।
// পারে না: username, slug, status, role, ট্রায়াল/সাবস্ক্রিপশন, commission — এগুলো শুধু Super Admin।
import { json, err } from '../../_lib/utils.js';
import { requireSeller, publicSeller } from '../../_lib/auth.js';
import { validateProfile, getSeller } from '../../_lib/sellers.js';

export async function onRequestGet({ request, env }) {
  const auth = await requireSeller(request, env, { permission: 'profile:read' });
  if (auth.response) return auth.response;
  return json({ seller: publicSeller(auth.seller), subscription: auth.subscription });
}

export async function onRequestPut({ request, env }) {
  const auth = await requireSeller(request, env, { permission: 'profile:write' });
  if (auth.response) return auth.response;
  let b; try { b = await request.json(); } catch (e) { return err('অবৈধ রিকোয়েস্ট', 400); }
  const FIELDS = ['name', 'store_name', 'phone', 'email', 'address', 'description', 'logo'];
  const clean = {}; FIELDS.forEach((k) => { if (b && b[k] !== undefined) clean[k] = b[k]; });   // allow-list: বাকি সব ফেলে দেওয়া
  const v = validateProfile(clean, { partial: true });
  if (v.error) return err(v.error, 400);
  const keys = Object.keys(v.data).filter((k) => FIELDS.includes(k));
  if (!keys.length) return err('পরিবর্তনের মতো কিছু পাঠানো হয়নি', 400);
  await env.DB.prepare(`UPDATE sellers SET ${keys.map((k) => k + ' = ?').join(', ')}, updated_at = datetime('now') WHERE id = ?`)
    .bind(...keys.map((k) => v.data[k]), auth.seller.id).run();
  return json({ ok: true, seller: publicSeller(await getSeller(env, auth.seller.id)) });
}
