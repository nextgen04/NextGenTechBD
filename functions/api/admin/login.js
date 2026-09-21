// POST /api/admin/login — অ্যাডমিন কী সঠিক কিনা যাচাই করে (প্রতিটা চেষ্টা লগ হয় — নিরাপত্তার জন্য)
import { json, err, logAdminLogin } from '../../_lib/utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { key } = await request.json();
    if (!env.ADMIN_KEY) {
      return err('সার্ভারে ADMIN_KEY সেট করা হয়নি — Cloudflare Pages → Settings → Environment variables এ যোগ করুন', 500);
    }
    if (!key || key !== env.ADMIN_KEY) {
      await logAdminLogin(env, false, request);
      return err('ভুল অ্যাডমিন কী', 401);
    }
    await logAdminLogin(env, true, request);
    return json({ ok: true });
  } catch (e) {
    return err('লগইন ব্যর্থ হয়েছে: ' + e.message, 400);
  }
}
