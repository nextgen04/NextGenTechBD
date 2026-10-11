// POST /api/seller/upload — সেলারের পণ্য/লোগোর ছবি Cloudinary-তে (আলাদা ফোল্ডারে); সেলার লগইন লাগবে
import { requireSeller } from '../../_lib/auth.js';
import { uploadImageFromRequest } from '../../_lib/cloudinary.js';

export async function onRequestPost({ request, env }) {
  const auth = await requireSeller(request, env, { permission: 'products:write' });
  if (auth.response) return auth.response;
  return uploadImageFromRequest(request, env, `nextgentechbd/sellers/${auth.seller.id}`);
}
