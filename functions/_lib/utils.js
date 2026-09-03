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

// অ্যাডমিন প্যানেলের প্রতিটি রিকোয়েস্টে 'X-Admin-Key' হেডারে সিক্রেট কী থাকতে হবে।
// এই কী Cloudflare Pages প্রজেক্টের Environment Variable/Secret হিসেবে ADMIN_KEY নামে সেট করতে হবে।
export function requireAdmin(request, env) {
  const key = request.headers.get('X-Admin-Key') || '';
  if (!env.ADMIN_KEY) {
    return err('সার্ভারে ADMIN_KEY সেট করা হয়নি — Cloudflare Pages → Settings → Environment variables এ যোগ করুন', 500);
  }
  if (!key || key !== env.ADMIN_KEY) {
    return err('অননুমোদিত — সঠিক অ্যাডমিন কী দিয়ে লগইন করুন', 401);
  }
  return null; // null মানে অনুমোদিত, আটকানোর দরকার নেই
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
  return hash === expectedHash;
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
    const row = await env.DB.prepare(
      `SELECT s.customer_id as customer_id, s.expires_at as expires_at, c.name as name, c.phone as phone, c.email as email
       FROM customer_sessions s JOIN customers c ON c.id = s.customer_id
       WHERE s.token = ?`
    )
      .bind(token)
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
