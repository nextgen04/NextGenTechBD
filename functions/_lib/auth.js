// কমন authentication / authorization হেল্পার — Super Admin ও Seller দুটোর জন্য।
//
// মূল নিয়ম:
//  • Seller কখনো ADMIN_KEY বা admin session পায় না; দুটো সম্পূর্ণ আলাদা cookie/টেবিল/রোল।
//  • Seller-এর পরিচয় সবসময় সার্ভারে সেশন cookie থেকে বের হয় — ফ্রন্টএন্ড থেকে আসা seller_id কখনো বিশ্বাস করা হয় না।
//  • সেশন টোকেন DB-তে কাঁচা অবস্থায় থাকে না, শুধু SHA-256 হ্যাশ থাকে (DB লিক হলেও সেশন চুরি যায় না)।
//  • প্রতিটি রিকোয়েস্টে seller-এর status লাইভ চেক হয় — suspend/block করলে সাথে সাথে সব সেশন অকার্যকর।
import { json, err, hashPassword, createPasswordRecord } from './utils.js';
import { getMarketplaceSettings, computeSubscription } from './subscription.js';

export const SELLER_COOKIE = 'SELLER_SESSION';
export const ADMIN_COOKIE = 'ADMIN_SESSION';
const SELLER_SESSION_HOURS = 24 * 7;
const ADMIN_SESSION_HOURS = 12;

/* ================= রোল ও পারমিশন (ভবিষ্যতে SELLER_STAFF যোগ করার জায়গা) ================= */
export const ROLES = { SUPER_ADMIN: 'SUPER_ADMIN', SELLER: 'SELLER', SELLER_STAFF: 'SELLER_STAFF' };
export const ROLE_PERMISSIONS = {
  SUPER_ADMIN: ['*'],
  SELLER: ['products:read', 'products:write', 'orders:read', 'orders:write', 'stock:write', 'reviews:read', 'profile:read', 'profile:write', 'dashboard:read'],
  // ভবিষ্যতের জন্য প্রস্তুত: স্টাফ শুধু অর্ডার/স্টক দেখবে
  SELLER_STAFF: ['products:read', 'orders:read', 'orders:write', 'stock:write', 'dashboard:read'],
};
export function hasPermission(role, permission) {
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes('*') || perms.includes(permission);
}

/* ================= নিম্নস্তরের হেল্পার ================= */
export async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// দৈর্ঘ্য নির্বিশেষে constant-time স্ট্রিং তুলনা
export function timingSafeEqualStr(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

export function parseCookies(request) {
  const out = {};
  const raw = request.headers.get('Cookie') || '';
  raw.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  });
  return out;
}

function isHttps(request) {
  try { return new URL(request.url).protocol === 'https:'; } catch (e) { return true; }
}

// HttpOnly + SameSite=Strict (CSRF প্রতিরোধ) + HTTPS-এ Secure
export function buildCookie(request, name, value, maxAgeSeconds) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}` + (isHttps(request) ? '; Secure' : '');
}
export function clearCookie(request, name) {
  return buildCookie(request, name, '', 0);
}

export function withCookies(response, cookies) {
  (cookies || []).forEach((c) => response.headers.append('Set-Cookie', c));
  return response;
}

export function getClientIp(request) {
  return request.headers.get('CF-Connecting-IP') || '';
}

export function isSafeMethod(method) {
  return ['GET', 'HEAD', 'OPTIONS'].includes(String(method).toUpperCase());
}

// CSRF-এর দ্বিতীয় স্তর: ব্রাউজার থেকে আসা state-changing রিকোয়েস্টের Origin অবশ্যই একই সাইট হতে হবে।
// (Origin/Sec-Fetch-Site না থাকলে ব্রাউজার নয় — যেমন curl/সার্ভার — কিন্তু তখন cookie-ও ব্রাউজার থেকে আসেনি ধরে নেওয়া হয়।)
export function checkSameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (origin) {
    try { return new URL(origin).host === new URL(request.url).host; } catch (e) { return false; }
  }
  const sfs = request.headers.get('Sec-Fetch-Site');
  if (sfs && !['same-origin', 'none'].includes(sfs)) return false;
  return true;
}

/* ================= Super Admin ================= */
async function adminSessionHash(token, env) {
  // ADMIN_KEY বদলালে সব পুরনো admin session নিজে থেকেই অকার্যকর হয়ে যায়
  return sha256Hex(token + ':' + (env.ADMIN_KEY || ''));
}

export async function createAdminSession(env, request) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + ADMIN_SESSION_HOURS * 3600 * 1000).toISOString();
  try {
    await env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').bind(new Date().toISOString()).run();
    await env.DB.prepare('INSERT INTO admin_sessions (token_hash, expires_at, ip, user_agent) VALUES (?, ?, ?, ?)')
      .bind(await adminSessionHash(token, env), expires, getClientIp(request), (request.headers.get('User-Agent') || '').slice(0, 200))
      .run();
  } catch (e) {
    return null; // 007 মাইগ্রেশন চালানো না থাকলে cookie সেশন ছাড়াই (X-Admin-Key দিয়ে) চলবে
  }
  return { cookie: buildCookie(request, ADMIN_COOKIE, token, ADMIN_SESSION_HOURS * 3600), expires };
}

export async function getAdminSession(request, env) {
  const token = parseCookies(request)[ADMIN_COOKIE];
  if (!token || token.length < 32 || token.length > 200 || !env.ADMIN_KEY) return null;
  try {
    const row = await env.DB.prepare('SELECT expires_at FROM admin_sessions WHERE token_hash = ?')
      .bind(await adminSessionHash(token, env)).first();
    if (!row || new Date(row.expires_at).getTime() < Date.now()) return null;
    return { ok: true };
  } catch (e) {
    return null;
  }
}

export async function destroyAdminSession(request, env) {
  const token = parseCookies(request)[ADMIN_COOKIE];
  if (!token) return;
  try { await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(await adminSessionHash(token, env)).run(); } catch (e) { /* ignore */ }
}

// সব /api/admin/* endpoint-এর গেট। null = অনুমোদিত, Response = আটকানো হয়েছে।
// X-Admin-Key (আগের মতোই, backward-compatible) অথবা HttpOnly ADMIN_SESSION cookie — Seller cookie এখানে কখনো কাজ করে না।
export async function requireAdmin(request, env) {
  const key = request.headers.get('X-Admin-Key') || '';
  if (key) {
    if (!env.ADMIN_KEY) return err('সার্ভারে ADMIN_KEY সেট করা হয়নি — Cloudflare Pages → Settings → Environment variables এ যোগ করুন', 500);
    return timingSafeEqualStr(key, env.ADMIN_KEY) ? null : err('অননুমোদিত — সঠিক অ্যাডমিন কী দিয়ে লগইন করুন', 401);
  }
  const session = await getAdminSession(request, env);
  if (session) {
    if (!isSafeMethod(request.method) && !checkSameOrigin(request)) return err('অনুমোদিত নয় (cross-site রিকোয়েস্ট)', 403);
    return null;
  }
  if (!env.ADMIN_KEY) return err('সার্ভারে ADMIN_KEY সেট করা হয়নি — Cloudflare Pages → Settings → Environment variables এ যোগ করুন', 500);
  return err('অননুমোদিত — সঠিক অ্যাডমিন কী দিয়ে লগইন করুন', 401);
}

/* ================= Seller ================= */
export const SELLER_PUBLIC_COLS = `id, seller_code, username, slug, role, name, store_name, phone, email, address, logo, description,
  status, is_system, trial_ends_at, subscription_plan_id, subscription_ends_at, access_override, created_at, last_login_at`;

// ক্লায়েন্টকে পাঠানোর জন্য নিরাপদ seller অবজেক্ট (পাসওয়ার্ড/হ্যাশ কখনো নয়)
export function publicSeller(s) {
  if (!s) return null;
  const { id, seller_code, username, slug, role, name, store_name, phone, email, address, logo, description, status,
    trial_ends_at, subscription_plan_id, subscription_ends_at, created_at, last_login_at } = s;
  return { id, seller_code, username, slug, role, name, store_name, phone, email, address, logo, description, status,
    trial_ends_at, subscription_plan_id, subscription_ends_at, created_at, last_login_at };
}

export async function createSellerSession(env, request, sellerId) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + SELLER_SESSION_HOURS * 3600 * 1000).toISOString();
  await env.DB.prepare('DELETE FROM seller_sessions WHERE expires_at < ?').bind(new Date().toISOString()).run();
  await env.DB.prepare('INSERT INTO seller_sessions (token_hash, seller_id, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?)')
    .bind(await sha256Hex(token), sellerId, expires, getClientIp(request), (request.headers.get('User-Agent') || '').slice(0, 200))
    .run();
  return { cookie: buildCookie(request, SELLER_COOKIE, token, SELLER_SESSION_HOURS * 3600), expires };
}

// পাসওয়ার্ড রিসেট / ব্লক / ডিলিটের সময় কল করুন — সেলারের সব সেশন বাতিল
export async function revokeSellerSessions(env, sellerId) {
  await env.DB.prepare('DELETE FROM seller_sessions WHERE seller_id = ?').bind(sellerId).run();
}

export async function destroySellerSession(request, env) {
  const token = parseCookies(request)[SELLER_COOKIE];
  if (!token) return;
  try { await env.DB.prepare('DELETE FROM seller_sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run(); } catch (e) { /* ignore */ }
}

// সেশন cookie থেকে লগইন করা seller ফেরত দেয় (না থাকলে/অবৈধ/সাসপেন্ড হলে null)
export async function getAuthenticatedSeller(request, env) {
  const token = parseCookies(request)[SELLER_COOKIE];
  if (!token || token.length < 32 || token.length > 200) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT s.expires_at AS session_expires, sel.deleted_at AS deleted_at,
              ${SELLER_PUBLIC_COLS.split(',').map((c) => 'sel.' + c.trim()).join(', ')}
       FROM seller_sessions s JOIN sellers sel ON sel.id = s.seller_id
       WHERE s.token_hash = ?`
    ).bind(await sha256Hex(token)).first();
    if (!row) return null;
    if (new Date(row.session_expires).getTime() < Date.now()) return null;
    if (row.deleted_at || row.is_system || row.status !== 'active') return null;
    const { session_expires, deleted_at, ...seller } = row;
    return seller;
  } catch (e) {
    return null;
  }
}

// প্রতিটি /api/seller/* endpoint-এর গেট।
//   const auth = await requireSeller(request, env, { permission: 'products:write', needSubscription: true });
//   if (auth.response) return auth.response;
//   const seller = auth.seller;   // seller.id সবসময় সার্ভারের সেশন থেকে — কখনো request body থেকে নয়
// needSubscription: ট্রায়াল/সাবস্ক্রিপশন শেষ হলে নতুন পণ্য যোগ/এডিটের মতো কাজ আটকাতে
export async function requireSeller(request, env, opts = {}) {
  const seller = await getAuthenticatedSeller(request, env);
  if (!seller) return { response: err('লগইন করা প্রয়োজন', 401) };
  if (!isSafeMethod(request.method) && !checkSameOrigin(request)) return { response: err('অনুমোদিত নয় (cross-site রিকোয়েস্ট)', 403) };
  if (opts.permission && !hasPermission(seller.role, opts.permission)) return { response: err('এই কাজের অনুমতি নেই', 403) };
  const settings = await getMarketplaceSettings(env);
  const subscription = computeSubscription(seller, settings);
  if (opts.needSubscription && !subscription.can_sell) {
    return { response: json({ error: 'আপনার ট্রায়াল/সাবস্ক্রিপশনের মেয়াদ শেষ — চালিয়ে যেতে সাবস্ক্রিপশন নিন', code: 'SUBSCRIPTION_EXPIRED', subscription }, 402) };
  }
  return { seller, subscription, settings };
}

// গত ১৫ মিনিটে (শেষ সফল লগইনের পর) কতবার ভুল হয়েছে — লগইন ও পাসওয়ার্ড-পরিবর্তন দুই জায়গায় একই সীমা
export const MAX_FAILS_PER_USERNAME = 5;
export async function countRecentFailedLogins(env, username) {
  // "শেষ সফল লগইন/রিসেট মার্কারের পরে" — সময় নয়, সারির id দিয়ে তুলনা (একই সেকেন্ডে ঘটলেও ভুল গণনা হয় না)
  const r = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM seller_login_log
     WHERE username = ? AND success = 0 AND created_at >= datetime('now', '-15 minutes')
       AND id > COALESCE((SELECT MAX(id) FROM seller_login_log WHERE username = ? AND success IN (1, 2)), 0)`
  ).bind(username, username).first();
  return r ? r.c : 0;
}
export async function logSellerLoginAttempt(env, request, sellerId, username, success) {
  try {
    await env.DB.prepare('INSERT INTO seller_login_log (seller_id, username, success, ip, user_agent) VALUES (?, ?, ?, ?, ?)')
      .bind(sellerId || null, String(username).slice(0, 60), success ? 1 : 0, getClientIp(request), (request.headers.get('User-Agent') || '').slice(0, 200)).run();
  } catch (e) { /* লগ ব্যর্থ হলেও মূল কাজ আটকানো যাবে না */ }
}

/* ================= ইনপুট ভ্যালিডেশন (Phase 4 সেলার তৈরি/রিসেটেও ব্যবহার হবে) ================= */
export function validateUsername(u) {
  return /^[a-z0-9][a-z0-9_.-]{2,29}$/i.test(String(u || ''));
}
export function validatePassword(p) {
  const s = String(p || '');
  if (s.length < 8) return 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে';
  if (s.length > 100) return 'পাসওয়ার্ড সর্বোচ্চ ১০০ অক্ষরের হতে পারবে';
  if (!/[A-Za-z]/.test(s) || !/[0-9]/.test(s)) return 'পাসওয়ার্ডে অন্তত একটি অক্ষর ও একটি সংখ্যা থাকতে হবে';
  return null;
}
export { createPasswordRecord, hashPassword };
