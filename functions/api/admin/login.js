// POST /api/admin/login — অ্যাডমিন কী সঠিক কিনা যাচাই করে
import { json, err } from '../../_lib/utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { key } = await request.json();
    if (!env.ADMIN_KEY) {
      return err('সার্ভারে ADMIN_KEY সেট করা হয়নি — Cloudflare Pages → Settings → Environment variables এ যোগ করুন', 500);
    }
    if (!key || key !== env.ADMIN_KEY) {
      return err('ভুল অ্যাডমিন কী', 401);
    }
    return json({ ok: true });
  } catch (e) {
    return err('লগইন ব্যর্থ হয়েছে: ' + e.message, 400);
  }
}
