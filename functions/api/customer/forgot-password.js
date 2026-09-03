// POST /api/customer/forgot-password — { phone }
// গ্রাহক পাসওয়ার্ড ভুলে গেলে প্রথমে তার মোবাইল নম্বর যাচাই করা হয় — নম্বরটার সাথে অ্যাকাউন্ট থাকলে
// ফ্রন্টএন্ড তখনই "নতুন পাসওয়ার্ড সেট করুন" ধাপে নিয়ে যায় (কোনো ইমেইল/এসএমএস/হোয়াটসঅ্যাপ কোড লাগে না)।
import { json, err } from '../../_lib/utils.js';

const PHONE_RE = /^01[3-9]\d{8}$/;

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { phone } = await request.json();
    if (!phone || !PHONE_RE.test(phone.trim())) return err('সঠিক মোবাইল নম্বর দিন (যেমন 017XXXXXXXX)', 400);

    const customer = await env.DB.prepare('SELECT id FROM customers WHERE phone = ?').bind(phone.trim()).first();
    if (!customer) return err('এই নম্বরে কোনো অ্যাকাউন্ট পাওয়া যায়নি', 404);

    return json({ ok: true });
  } catch (e) {
    return err('যাচাই করা যায়নি: ' + e.message, 500);
  }
}
