// সব API ফাংশনের জন্য কমন হেল্পার ফাংশন

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export function err(message, status = 400) {
  return json({ error: message }, status);
}

// অ্যাডমিন প্যানেলের প্রতিটি রিকোয়েস্টে 'X-Admin-Key' হেডারে লগইনের সময় পাওয়া মেয়াদি সেশন টোকেন থাকতে হবে।
// (আসল ADMIN_KEY/পাসওয়ার্ড শুধু /api/admin/login এ যায়; বাকি সব রিকোয়েস্টে টোকেন যায় — DB-তে টোকেনের শুধু হ্যাশ থাকে)
export async function requireAdmin(request, env) {
  const token = request.headers.get('X-Admin-Key') || '';
  if (!token) return err('অননুমোদিত — লগইন করুন', 401);
  try {
    const hash = await sha256Hex(token);
    const row = await env.DB.prepare('SELECT expires_at FROM admin_sessions WHERE token_hash = ?').bind(hash).first();
    if (!row || new Date(row.expires_at).getTime() < Date.now()) {
      return err('অননুমোদিত — সেশন শেষ, আবার লগইন করুন', 401);
    }
    return null; // null মানে অনুমোদিত, আটকানোর দরকার নেই
  } catch (e) {
    console.error('requireAdmin failed:', e && e.message);
    return err('সার্ভারে সমস্যা হয়েছে', 500);
  }
}

export function parseListField(v) {
  if (!v) return undefined;
  try {
    const arr = JSON.parse(v);
    return Array.isArray(arr) ? arr : undefined;
  } catch (e) {
    return undefined;
  }
}

export function toBool(v) {
  return v === 1 || v === true || v === '1' || v === 'true';
}

/* ============ গ্রাহক পাসওয়ার্ড হ্যাশিং (PBKDF2, Web Crypto — কোনো এক্সটার্নাল প্যাকেজ লাগে না) ============ */

function randomHex(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createPasswordRecord(password) {
  const salt = randomHex(16);
  const hash = await hashPassword(password, salt);
  return { salt, hash };
}

export async function verifyPassword(password, salt, expectedHash) {
  const hash = await hashPassword(password, salt);
  return safeEqual(hash, expectedHash);
}

/* ============ গ্রাহক সেশন টোকেন ============ */

const SESSION_DAYS = 30;

export function newSessionToken() {
  return crypto.randomUUID().replace(/-/g, '') + randomHex(16);
}

export function sessionExpiryDate() {
  const d = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  return d.toISOString();
}

// রিকোয়েস্টের 'X-Session-Token' হেডার যাচাই করে বৈধ হলে customer_id ফেরত দেয়, নাহলে null
export async function getCustomerFromRequest(request, env) {
  const token = request.headers.get('X-Session-Token');
  if (!token) return null;
  try {
    const tokenHash = await sha256Hex(token); // DB-তে টোকেনের শুধু হ্যাশ থাকে
    const row = await env.DB.prepare(
      `SELECT s.customer_id as customer_id, s.expires_at as expires_at, c.name as name, c.phone as phone, c.email as email
       FROM customer_sessions s JOIN customers c ON c.id = s.customer_id
       WHERE s.token = ?`
    )
      .bind(tokenHash)
      .first();
    if (!row) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) return null;
    return { id: row.customer_id, name: row.name, phone: row.phone, email: row.email };
  } catch (e) {
    return null;
  }
}

export function requireCustomer(customer) {
  if (!customer) return err('লগইন করা প্রয়োজন', 401);
  return null;
}

/* ============ শেয়ার্ড কনস্ট্যান্ট ============ */
export const ORDER_STATUSES = ['pending', 'processing', 'confirmed', 'shipped', 'delivered', 'cancelled', 'returned'];

export async function logAdminLogin(env, success, request) {
  try {
    await env.DB.prepare('INSERT INTO admin_login_log (success, ip, user_agent) VALUES (?, ?, ?)')
      .bind(success ? 1 : 0, request.headers.get('CF-Connecting-IP') || '', request.headers.get('User-Agent') || '')
      .run();
  } catch (e) {
    // লগ ব্যর্থ হলেও লগইন প্রসেস আটকানো ঠিক না
  }
}


/* ============ রিসেট/সেশন হেল্পার (ইমেইলের মাধ্যমে পাসওয়ার্ড রিসেটের জন্য) ============ */

export const DEFAULT_ADMIN_EMAIL = 'tnextgen04@gmail.com';
export const RESET_TOKEN_MINUTES = 30;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function adminEmail(env) {
  return String(env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim();
}

export function normalizeEmail(v) {
  return String(v || '').trim().toLowerCase();
}

export async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(str)));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// constant-time তুলনা (দুটোকেই আগে SHA-256 করে নেওয়া হয় যাতে দৈর্ঘ্য/সময় থেকে কিছু বোঝা না যায়)
export async function safeEqual(a, b) {
  const [ha, hb] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0;
}

// ৬৪ অক্ষরের র‍্যান্ডম হেক্স টোকেন (২৫৬ বিট)
export function newSecretToken() {
  return randomHex(32);
}

export function futureIso(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

// রিসেট লিংকে ব্যবহারের জন্য সাইটের বেস URL — SITE_URL env সেট থাকলে সেটা, নাহলে রিকোয়েস্টের origin
export function siteUrl(request, env) {
  return String(env.SITE_URL || new URL(request.url).origin).replace(/\/+$/, '');
}

export function escapeHtml(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const TOKEN_RE = /^[0-9a-f]{64}$/;
