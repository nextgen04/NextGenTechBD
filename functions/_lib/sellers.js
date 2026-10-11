// সেলার ম্যানেজমেন্টের কমন হেল্পার (Super Admin API গুলো ব্যবহার করে)
import { randomToken, SELLER_PUBLIC_COLS } from './auth.js';

export const SELLER_STATUSES = ['active', 'suspended', 'blocked'];
const RESERVED_USERNAMES = ['admin', 'administrator', 'root', 'superadmin', 'super-admin', 'support', 'system', 'api', 'seller', 'store', 'nextgentechbd-official'];
export const isReservedUsername = (u) => RESERVED_USERNAMES.includes(String(u).toLowerCase());

export function cleanText(v, max = 200) {
  return String(v === undefined || v === null ? '' : v).trim().slice(0, max);
}
const hasAngle = (s) => /[<>"`\\]/.test(s);
export const validUrl = (u) => !u || /^https:\/\/[^\s"'<>]+$/i.test(u) || /^\/[^\s"'<>/][^\s"'<>]*$/.test(u);
const validEmail = (e) => !e || /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(e);
const validPhone = (p) => !p || /^[0-9+\-\s]{6,20}$/.test(p);

export function slugify(str) {
  const s = String(str || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return s;
}

// base = স্টোরের নাম; ল্যাটিন অক্ষর না থাকলে (যেমন বাংলা নাম) fallback = ইউজারনেম, তারপর 'store'
export async function uniqueSlug(env, base, excludeId = 0, fallback = '') {
  let slug = slugify(base) || slugify(fallback) || 'store';
  if (['new', 'admin', 'api'].includes(slug)) slug += '-store';
  for (let i = 0; i < 6; i++) {
    const cand = i === 0 ? slug : slug + '-' + randomToken(2);
    const row = await env.DB.prepare('SELECT id FROM sellers WHERE slug = ? AND id != ?').bind(cand, excludeId).first();
    if (!row) return cand;
  }
  return slug + '-' + randomToken(4);
}

// সেলারের প্রোফাইল ফিল্ড যাচাই। partial=true হলে (এডিট) শুধু পাঠানো ফিল্ড যাচাই হয়।
export function validateProfile(b, { partial = false } = {}) {
  const out = {};
  const text = (key, label, max, required) => {
    if (b[key] === undefined) { if (required && !partial) return `${label} আবশ্যক`; return null; }
    const v = cleanText(b[key], max);
    if (required && v.length < 2) return `${label} কমপক্ষে ২ অক্ষরের হতে হবে`;
    if (hasAngle(v)) return label + '-এ < > " ` \\ চিহ্ন ব্যবহার করা যাবে না';
    out[key] = v || null;
    return null;
  };
  for (const e of [
    text('name', 'সেলারের নাম', 80, true),
    text('store_name', 'স্টোরের নাম', 80, true),
    text('phone', 'মোবাইল নম্বর', 20, false),
    text('email', 'ইমেইল', 120, false),
    text('address', 'ঠিকানা', 300, false),
    text('description', 'স্টোর বিবরণ', 1000, false),
    text('logo', 'লোগো', 500, false),
  ]) if (e) return { error: e };
  if (out.phone && !validPhone(out.phone)) return { error: 'মোবাইল নম্বর সঠিক নয়' };
  if (out.email && !validEmail(out.email)) return { error: 'ইমেইল সঠিক নয়' };
  if (out.logo && !validUrl(out.logo)) return { error: 'লোগো URL অবশ্যই https:// দিয়ে শুরু হতে হবে' };
  if (b.commission_percent !== undefined) {
    const c = Number(b.commission_percent);
    if (!(c >= 0 && c <= 100)) return { error: 'কমিশন ০ থেকে ১০০ এর মধ্যে হতে হবে' };
    out.commission_percent = c;
  }
  return { data: out };
}

// পড়তে সহজ (ambiguous অক্ষর বাদ) র‍্যান্ডম পাসওয়ার্ড — কমপক্ষে একটি অক্ষর ও একটি সংখ্যা নিশ্চিত
export function generatePassword(len = 12) {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = letters + digits;
  const rnd = (n) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
  const chars = [letters[rnd(letters.length)], digits[rnd(digits.length)]];
  while (chars.length < len) chars.push(all[rnd(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = rnd(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}

export const sellerCodeFor = (id) => 'SLR-' + String(id).padStart(6, '0');

export async function getSeller(env, id) {
  return env.DB.prepare(`SELECT ${SELLER_PUBLIC_COLS}, commission_percent, deleted_at FROM sellers WHERE id = ?`).bind(Number(id)).first();
}

// বিক্রয়ের হিসাব — বাতিল/ফেরত আইটেম বাদে। "আজ/এই সপ্তাহ/এই মাস" বাংলাদেশ সময় (UTC+6) অনুযায়ী।
export async function salesSummary(env, sellerId) {
  const row = await env.DB.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN date(created_at,'+6 hours') = date('now','+6 hours') THEN subtotal END),0) AS today,
       COALESCE(SUM(CASE WHEN date(created_at,'+6 hours') >= date('now','+6 hours','-6 days') THEN subtotal END),0) AS week,
       COALESCE(SUM(CASE WHEN strftime('%Y-%m',created_at,'+6 hours') = strftime('%Y-%m','now','+6 hours') THEN subtotal END),0) AS month,
       COALESCE(SUM(subtotal),0) AS total
     FROM order_items WHERE seller_id = ? AND seller_status NOT IN ('cancelled','returned')`
  ).bind(sellerId).first();
  return row || { today: 0, week: 0, month: 0, total: 0 };
}

export async function recordSubscription(env, { sellerId, planId = null, kind, amount = 0, method = null, ref = null, startsAt, endsAt, note = null, by = 'super_admin' }) {
  await env.DB.prepare(
    `INSERT INTO seller_subscriptions (seller_id, plan_id, kind, amount, payment_method, payment_ref, starts_at, ends_at, note, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(sellerId, planId, kind, amount, method, ref, startsAt, endsAt, note, by).run();
}

export const parseId = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
