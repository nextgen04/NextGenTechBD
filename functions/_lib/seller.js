// Multi-Vendor: Seller লগইন সেশন, পারমিশন ও মালিকানা (ownership) যাচাইয়ের কমন হেল্পার।
// 🔒 নিয়ম: প্রতিটি /api/seller/* এন্ডপয়েন্ট প্রথমে requireSeller() চালায়; তারপর দরকারি পারমিশন (can(...)) এবং
//    প্রতিটি পণ্য/অর্ডার-লাইনের ক্ষেত্রে seller_id = সেশনের seller.id শর্ত SQL-এই বসানো থাকে (শুধু ব্রাউজারের ওপর ভরসা নয়)।
import { json, err, sha256Hex } from './utils.js';

export const PERMISSIONS = ['can_product_create', 'can_product_edit', 'can_product_delete', 'can_order_manage', 'can_stock_manage', 'can_sales_report'];
export const SELLER_SESSION_HOURS = 12;

// 'X-Seller-Token' হেডার যাচাই করে। সফল হলে { seller } , ব্যর্থ হলে { denied: Response }।
// সেশন বৈধ হলেও Seller 'suspended' হলে প্রবেশ বন্ধ; পারমিশন প্রতিবার DB থেকেই পড়া হয় (Super Admin বদলালে সাথে সাথে কার্যকর)।
export async function requireSeller(request, env) {
  const token = request.headers.get('X-Seller-Token') || '';
  if (!/^[0-9a-f]{64}$/.test(token)) return { denied: err('অননুমোদিত — Seller হিসেবে লগইন করুন', 401) };
  try {
    const hash = await sha256Hex(token);
    const row = await env.DB.prepare(
      `SELECT s.id, s.shop_name, s.owner_name, s.email, s.phone, s.status,
              s.can_product_create, s.can_product_edit, s.can_product_delete, s.can_order_manage, s.can_stock_manage, s.can_sales_report,
              ss.expires_at
       FROM seller_sessions ss JOIN sellers s ON s.id = ss.seller_id
       WHERE ss.token_hash = ?`
    ).bind(hash).first();
    if (!row || new Date(row.expires_at).getTime() < Date.now()) {
      return { denied: err('অননুমোদিত — সেশন শেষ, আবার লগইন করুন', 401) };
    }
    if (row.status !== 'active') return { denied: err('আপনার Seller অ্যাকাউন্ট বর্তমানে বন্ধ আছে — Super Admin-এর সাথে যোগাযোগ করুন', 403) };
    const seller = { ...row };
    delete seller.expires_at;
    return { seller };
  } catch (e) {
    console.error('requireSeller failed:', e && e.message);
    return { denied: err('সার্ভারে সমস্যা হয়েছে', 500) };
  }
}

export function can(seller, perm) {
  return !!seller && PERMISSIONS.includes(perm) && Number(seller[perm]) === 1;
}

export function forbidden(perm) {
  const names = {
    can_product_create: 'পণ্য তৈরির', can_product_edit: 'পণ্য এডিটের', can_product_delete: 'পণ্য মুছার',
    can_order_manage: 'অর্ডার ম্যানেজমেন্টের', can_stock_manage: 'স্টক ম্যানেজমেন্টের', can_sales_report: 'সেলস রিপোর্টের',
  };
  return err(`আপনার ${names[perm] || 'এই কাজের'} অনুমতি নেই — Super Admin-এর কাছে অনুরোধ করুন`, 403);
}

// Seller-এর পাবলিক-নিরাপদ তথ্য (হ্যাশ/সল্ট কখনো বের হয় না)
export function publicSeller(s) {
  return {
    id: s.id, shop_name: s.shop_name, owner_name: s.owner_name, email: s.email, phone: s.phone, status: s.status,
    permissions: Object.fromEntries(PERMISSIONS.map((p) => [p, Number(s[p]) === 1])),
  };
}

// ছবির URL যাচাই: শুধু https; CLOUDINARY_CLOUD_NAME সেট থাকলে শুধু ওই ক্লাউডের ছবি (বাইরের লিংক ঢোকানো আটকায়)
export function validImageUrl(env, url) {
  if (url === null || url === undefined || url === '') return true;
  const u = String(url);
  if (u.length > 500 || !/^https:\/\//i.test(u)) return false;
  if (env.CLOUDINARY_CLOUD_NAME) {
    return u.startsWith(`https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/`);
  }
  return true;
}

// অর্ডারের মূল status হিসাব: সব (বাতিল বাদে) লাইনের status এক হলে সেটাই অর্ডারের status হয়
const ROLLUP_ORDER = ['pending', 'processing', 'confirmed', 'shipped', 'delivered', 'returned'];
export async function rollupOrderStatus(env, orderId) {
  const res = await env.DB.prepare('SELECT status FROM order_items WHERE order_id = ?').bind(orderId).all();
  const sts = (res.results || []).map((r) => r.status);
  if (!sts.length) return null;
  const live = sts.filter((s) => s !== 'cancelled');
  let next = null;
  if (!live.length) next = 'cancelled';
  else if (live.every((s) => s === live[0])) next = live[0];
  else if (live.some((s) => s === 'shipped' || s === 'delivered')) next = 'shipped';
  if (!next || !ROLLUP_ORDER.concat('cancelled').includes(next)) return null;
  const cur = await env.DB.prepare('SELECT status FROM orders WHERE id = ?').bind(orderId).first();
  if (!cur || cur.status === next) return null;
  await env.DB.batch([
    env.DB.prepare('UPDATE orders SET status = ? WHERE id = ?').bind(next, orderId),
    env.DB.prepare('INSERT INTO order_status_history (order_id, status, note) VALUES (?, ?, ?)').bind(orderId, next, 'Seller আপডেট থেকে স্বয়ংক্রিয়'),
  ]);
  return next;
}

export { json, err };
