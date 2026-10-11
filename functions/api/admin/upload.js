// POST /api/admin/upload — অ্যাডমিন প্যানেল থেকে পণ্যের ছবি আপলোড (Super Admin অনুমোদন লাগবে)
// ছবি সরাসরি Cloudinary-তে আপলোড হয় ও তাৎক্ষণিক লাইভ হয় (বিস্তারিত: _lib/cloudinary.js)
import { requireAdmin } from '../../_lib/auth.js';
import { uploadImageFromRequest } from '../../_lib/cloudinary.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  return uploadImageFromRequest(request, env, 'nextgentechbd/products');
}
