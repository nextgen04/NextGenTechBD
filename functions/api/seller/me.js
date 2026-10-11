// GET /api/seller/me — লগইন করা সেলারের তথ্য + সাবস্ক্রিপশন/ট্রায়ালের অবস্থা
import { json } from '../../_lib/utils.js';
import { requireSeller, publicSeller } from '../../_lib/auth.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await requireSeller(request, env);
  if (auth.response) return auth.response;
  return json({ seller: publicSeller(auth.seller), subscription: auth.subscription });
}
