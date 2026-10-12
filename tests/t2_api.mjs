import fs from 'node:fs';
import { makeDB } from './d1shim.mjs';
import * as P from './build/functions/api/products.js';
import * as ORD from './build/functions/api/orders.js';
import * as ASel from './build/functions/api/admin/sellers.js';
import * as AProd from './build/functions/api/admin/products.js';
import * as AOrd from './build/functions/api/admin/orders.js';
import * as SLogin from './build/functions/api/seller/login.js';
import * as SLogout from './build/functions/api/seller/logout.js';
import * as SMe from './build/functions/api/seller/me.js';
import * as SProd from './build/functions/api/seller/products.js';
import * as SStock from './build/functions/api/seller/stock.js';
import * as SOrd from './build/functions/api/seller/orders.js';
import * as SRep from './build/functions/api/seller/reports.js';
import * as SUp from './build/functions/api/seller/upload.js';
import { sha256Hex } from './build/functions/_lib/utils.js';

let pass = 0, fail = 0;
const t = (c, m) => { if (c) pass++; else { fail++; console.log('  ✖ FAIL:', m); } };

const db = makeDB();
db.exec(fs.readFileSync('fixtures/old_schema.sql', 'utf8'));
db.exec(fs.readFileSync('fixtures/seed.sql', 'utf8'));
db.exec(fs.readFileSync('fixtures/m009.sql', 'utf8'));
const env = { DB: db, CLOUDINARY_CLOUD_NAME: 'democloud' };

async function call(mod, method, path, { body, headers = {}, ip = '1.1.1.1' } = {}) {
  const h = { 'CF-Connecting-IP': ip, ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const req = new Request('https://x.test' + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  const fn = mod['onRequest' + method[0] + method.slice(1).toLowerCase()];
  const res = await fn({ request: req, env });
  let j = {}; try { j = await res.json(); } catch (e) {}
  return { s: res.status, j };
}
// অ্যাডমিন সেশন (আসল লগইন ADMIN_KEY env লাগে; এখানে সরাসরি সেশন বসানো)
const adminTok = 'a'.repeat(64);
db.raw.prepare('INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?, ?)').run(await sha256Hex(adminTok), new Date(Date.now() + 3600e3).toISOString());
const AH = { 'X-Admin-Key': adminTok };

const cat = db.raw.prepare('SELECT id FROM categories LIMIT 1').get().id;
const platformProd = db.raw.prepare('SELECT id, price FROM products ORDER BY id LIMIT 1').get();

// ===== Super Admin: Seller তৈরি =====
let r = await call(ASel, 'POST', '/api/admin/sellers', { headers: AH, body: { shop_name: 'Shop A', email: 'a@shop.com', password: 'passwordA123', permissions: { can_product_create: true, can_product_edit: true, can_product_delete: true, can_order_manage: true, can_stock_manage: true, can_sales_report: true } } });
t(r.s === 200 && r.j.id, 'Super Admin Seller A তৈরি'); const A = r.j.id;
r = await call(ASel, 'POST', '/api/admin/sellers', { headers: AH, body: { shop_name: 'Shop B', email: 'b@shop.com', password: 'passwordB123', permissions: { can_product_create: true, can_product_edit: true } } });
t(r.s === 200, 'Seller B (সীমিত পারমিশন) তৈরি'); const B = r.j.id;
r = await call(ASel, 'POST', '/api/admin/sellers', { headers: AH, body: { shop_name: 'Dup', email: 'A@Shop.com', password: 'passwordX123' } });
t(r.s === 409, 'ডুপ্লিকেট ইমেইল (case-insensitive) আটকায়');
r = await call(ASel, 'POST', '/api/admin/sellers', { headers: AH, body: { shop_name: 'Weak', email: 'w@shop.com', password: 'short' } });
t(r.s === 400, 'দুর্বল (ছোট) পাসওয়ার্ড আটকায়');
r = await call(ASel, 'POST', '/api/admin/sellers', { body: { shop_name: 'X', email: 'x@shop.com', password: 'passwordX123' } });
t(r.s === 401, 'অ্যাডমিন টোকেন ছাড়া Seller তৈরি করা যায় না');
r = await call(ASel, 'GET', '/api/admin/sellers', { headers: AH });
t(r.s === 200 && r.j.sellers.length === 2 && !JSON.stringify(r.j).includes('password_hash') && !JSON.stringify(r.j).includes('salt'), 'Seller তালিকায় পাসওয়ার্ড হ্যাশ/সল্ট বের হয় না');
t(r.j.sellers.find((x) => x.id === B).permissions.can_order_manage === false, 'পারমিশন ডিফল্ট বন্ধ');

// ===== Seller লগইন =====
r = await call(SLogin, 'POST', '/api/seller/login', { body: { email: 'a@shop.com', password: 'wrong-password' } });
t(r.s === 401, 'ভুল পাসওয়ার্ডে লগইন ব্যর্থ');
r = await call(SLogin, 'POST', '/api/seller/login', { body: { email: 'nobody@shop.com', password: 'wrong-password' } });
t(r.s === 401 && r.j.error === (await call(SLogin, 'POST', '/api/seller/login', { body: { email: 'a@shop.com', password: 'zzzzzzzzzzz' }, ip: '9.9.9.9' })).j.error, 'ভুল ইমেইল/ভুল পাসওয়ার্ড — একই বার্তা (ইমেইল চেনা যায় না)');
r = await call(SLogin, 'POST', '/api/seller/login', { body: { email: 'A@SHOP.com', password: 'passwordA123' } });
t(r.s === 200 && /^[0-9a-f]{64}$/.test(r.j.token), 'Seller A লগইন সফল'); const TA = r.j.token;
t(!JSON.stringify(r.j).includes('password_hash'), 'লগইন রেসপন্সে হ্যাশ নেই');
r = await call(SLogin, 'POST', '/api/seller/login', { body: { email: 'b@shop.com', password: 'passwordB123' } }); const TB = r.j.token;
const HA = { 'X-Seller-Token': TA }, HB = { 'X-Seller-Token': TB };
// brute force
let last; for (let i = 0; i < 12; i++) last = await call(SLogin, 'POST', '/api/seller/login', { body: { email: 'b@shop.com', password: 'bad' + i }, ip: '7.7.7.7' });
t(last.s === 429, 'বারবার ভুল চেষ্টায় rate-limit (429)');

// ===== টোকেন আলাদা: Seller টোকেন Admin API-তে অচল, Admin টোকেন Seller API-তে অচল =====
r = await call(AProd, 'GET', '/api/admin/products', { headers: { 'X-Admin-Key': TA } });
t(r.s === 401, 'Seller টোকেন দিয়ে Admin Products API খোলে না');
r = await call(ASel, 'GET', '/api/admin/sellers', { headers: { 'X-Admin-Key': TA } });
t(r.s === 401, 'Seller টোকেন দিয়ে Seller-ম্যানেজমেন্ট (Admin) খোলে না');
r = await call(SProd, 'GET', '/api/seller/products', { headers: { 'X-Seller-Token': adminTok } });
t(r.s === 401, 'Admin টোকেন দিয়ে Seller API খোলে না');
r = await call(SProd, 'GET', '/api/seller/products', {});
t(r.s === 401, 'টোকেন ছাড়া Seller API বন্ধ');
r = await call(SProd, 'GET', '/api/seller/products', { headers: { 'X-Seller-Token': "' OR 1=1 --" } });
t(r.s === 401, 'SQL-injection টোকেন বন্ধ');

// ===== পণ্য: তৈরি / মালিকানা =====
const base = { name: 'A-এর পণ্য', price: 1000, old: 1200, cat, stock: 10 };
r = await call(SProd, 'POST', '/api/seller/products', { headers: HA, body: { ...base, seller_id: B, r: 5, rv: 999, sold: 999, f: 1, tag: 'hot' } });
t(r.s === 200, 'Seller A পণ্য তৈরি করতে পারে'); const pA = r.j.id;
const row = db.raw.prepare('SELECT * FROM products WHERE id=?').get(pA);
t(row.seller_id === A, 'body-তে seller_id=B পাঠালেও মালিক = সেশনের Seller A');
t(row.r === 0 && row.rv === 0 && row.sold === 0 && row.f === 0 && row.tag === null, 'Seller নকল রেটিং/রিভিউ/বিক্রি/ফ্ল্যাশ/ট্যাগ বসাতে পারে না');
r = await call(SProd, 'POST', '/api/seller/products', { headers: HB, body: { ...base, name: 'B-এর পণ্য', stock: 50 } });
t(r.s === 200, 'Seller B পণ্য তৈরি করে (create পারমিশন আছে)'); const pB = r.j.id;
t(db.raw.prepare('SELECT stock FROM products WHERE id=?').get(pB).stock === 0, 'স্টক-পারমিশন ছাড়া Seller-এর দেওয়া স্টক উপেক্ষিত → ০');
r = await call(SProd, 'GET', '/api/seller/products', { headers: HA });
t(r.j.products.length === 1 && r.j.products[0].id === pA, 'Seller A শুধু নিজের পণ্য দেখে');
r = await call(SProd, 'GET', '/api/seller/products', { headers: HB });
t(r.j.products.length === 1 && r.j.products[0].id === pB, 'Seller B শুধু নিজের পণ্য দেখে');

// অন্যের পণ্য এডিট/ডিলিট
r = await call(SProd, 'POST', '/api/seller/products', { headers: HB, body: { ...base, id: pA, name: 'HACKED', price: 1 } });
t(r.s === 404 && db.raw.prepare('SELECT name,price FROM products WHERE id=?').get(pA).name === 'A-এর পণ্য', 'B, A-এর পণ্য এডিট করতে পারে না (404, ডেটা অক্ষত)');
r = await call(SProd, 'DELETE', '/api/seller/products?id=' + pA, { headers: HB });
t(r.s === 403 || r.s === 404, 'B ডিলিট পারমিশনহীন/মালিকহীন — A-এর পণ্য মুছতে পারে না');
t(!!db.raw.prepare('SELECT id FROM products WHERE id=?').get(pA), 'A-এর পণ্য এখনো আছে');
// পারমিশন নিজেই আছে এমন Seller হয়েও অন্যেরটা নয়: B-কে delete পারমিশন দিই
await call(ASel, 'PATCH', '/api/admin/sellers', { headers: AH, body: { id: B, permissions: { can_product_delete: true } } });
r = await call(SProd, 'DELETE', '/api/seller/products?id=' + pA, { headers: HB });
t(r.s === 404 && !!db.raw.prepare('SELECT id FROM products WHERE id=?').get(pA), 'delete পারমিশন থাকলেও B অন্যের পণ্য মুছতে পারে না (ownership)');
// প্ল্যাটফর্মের (পুরোনো) পণ্য
r = await call(SProd, 'POST', '/api/seller/products', { headers: HA, body: { ...base, id: platformProd.id, name: 'HACK', price: 1 } });
t(r.s === 404 && db.raw.prepare('SELECT price FROM products WHERE id=?').get(platformProd.id).price === platformProd.price, 'Seller প্ল্যাটফর্মের পুরোনো পণ্য বদলাতে পারে না');
r = await call(SProd, 'DELETE', '/api/seller/products?id=' + platformProd.id, { headers: HA });
t(r.s === 404, 'Seller প্ল্যাটফর্মের পণ্য মুছতে পারে না');

// নিজের এডিট + স্টক গেটিং
r = await call(SProd, 'POST', '/api/seller/products', { headers: HA, body: { ...base, id: pA, price: 900, stock: 77 } });
t(r.s === 200 && db.raw.prepare('SELECT price,stock,seller_id FROM products WHERE id=?').get(pA).price === 900, 'A নিজের পণ্যের দাম বদলায়');
t(db.raw.prepare('SELECT stock FROM products WHERE id=?').get(pA).stock === 77 && db.raw.prepare('SELECT seller_id FROM products WHERE id=?').get(pA).seller_id === A, 'স্টক-পারমিশন থাকলে স্টক বদলায়; মালিক অপরিবর্তিত');
r = await call(SProd, 'POST', '/api/seller/products', { headers: HB, body: { ...base, id: pB, price: 555, stock: 9999, name: 'B-এর পণ্য' } });
t(r.s === 200 && db.raw.prepare('SELECT stock FROM products WHERE id=?').get(pB).stock === 0 && db.raw.prepare('SELECT price FROM products WHERE id=?').get(pB).price === 555, 'স্টক-পারমিশন ছাড়া এডিটে স্টক অপরিবর্তিত, দাম বদলায়');
// ভ্যালিডেশন
for (const [bad, why] of [[{ price: -5 }, 'ঋণাত্মক দাম'], [{ price: 'abc' }, 'দাম টেক্সট'], [{ name: '' }, 'খালি নাম'], [{ cat: 'nonexistent' }, 'ভুল ক্যাটাগরি'], [{ img: 'http://evil.com/x.png' }, 'বাইরের http ছবি'], [{ img: 'https://evil.com/x.png' }, 'অন্য ডোমেইনের ছবি']]) {
  r = await call(SProd, 'POST', '/api/seller/products', { headers: HA, body: { ...base, ...bad } });
  t(r.s === 400, 'ভ্যালিডেশন: ' + why);
}
r = await call(SProd, 'POST', '/api/seller/products', { headers: HA, body: { ...base, name: 'Img', img: 'https://res.cloudinary.com/democloud/image/upload/v1/nextgentechbd/sellers/' + A + '/products/abc.jpg' } });
t(r.s === 200, 'নিজের Cloudinary ক্লাউডের ছবির লিংক গ্রহণযোগ্য');
r = await call(SProd, 'POST', '/api/seller/products', { headers: HA, body: { ...base, name: "x'); DROP TABLE products;--" } });
t(r.s === 200 && db.raw.prepare('SELECT COUNT(*) c FROM products').get().c > 5, 'SQL-injection নাম নিরাপদে সংরক্ষিত (টেবিল অক্ষত)');

// ===== পারমিশন বন্ধ করলে সাথে সাথে কার্যকর =====
await call(ASel, 'PATCH', '/api/admin/sellers', { headers: AH, body: { id: A, permissions: { can_product_create: false } } });
r = await call(SProd, 'POST', '/api/seller/products', { headers: HA, body: { ...base, name: 'new' } });
t(r.s === 403, 'create পারমিশন বন্ধ → নতুন পণ্য 403 (একই সেশনে)');
r = await call(SProd, 'POST', '/api/seller/products', { headers: HA, body: { ...base, id: pA, name: 'A-এর পণ্য' } });
t(r.s === 200, 'create বন্ধ হলেও edit চালু থাকে (আলাদা সুইচ)');
await call(ASel, 'PATCH', '/api/admin/sellers', { headers: AH, body: { id: A, permissions: { can_product_edit: false } } });
r = await call(SProd, 'POST', '/api/seller/products', { headers: HA, body: { ...base, id: pA } });
t(r.s === 403, 'edit পারমিশন বন্ধ → 403');
await call(ASel, 'PATCH', '/api/admin/sellers', { headers: AH, body: { id: A, permissions: { can_product_create: true, can_product_edit: true } } });

// ===== স্টক =====
r = await call(SStock, 'POST', '/api/seller/stock', { headers: HA, body: { product_id: pA, change: 5, reason: 'restock' } });
const s0 = db.raw.prepare('SELECT stock FROM products WHERE id=?').get(pA).stock - 5;
t(r.s === 200 && r.j.stock === s0 + 5, 'A নিজের পণ্যের স্টক বাড়ায়');
r = await call(SStock, 'POST', '/api/seller/stock', { headers: HA, body: { product_id: pA, change: -1000 } });
t(r.s === 409 && db.raw.prepare('SELECT stock FROM products WHERE id=?').get(pA).stock === s0 + 5, 'স্টক ০-র নিচে নামানো যায় না');
r = await call(SStock, 'POST', '/api/seller/stock', { headers: HA, body: { product_id: pB, change: 5 } });
t(r.s === 404 && db.raw.prepare('SELECT stock FROM products WHERE id=?').get(pB).stock === 0, 'A, B-এর পণ্যের স্টক বদলাতে পারে না');
r = await call(SStock, 'GET', '/api/seller/stock?product_id=' + pB, { headers: HA });
t(r.s === 404, 'A, B-এর স্টক-ইতিহাস দেখতে পারে না');
r = await call(SStock, 'POST', '/api/seller/stock', { headers: HB, body: { product_id: pB, change: 5 } });
t(r.s === 403, 'B-এর stock পারমিশন নেই → 403');
r = await call(SStock, 'POST', '/api/seller/stock', { headers: HA, body: { product_id: platformProd.id, change: 5 } });
t(r.s === 404, 'প্ল্যাটফর্মের পণ্যের স্টক Seller বদলাতে পারে না');

// ===== পাবলিক স্টোর: সব Seller-এর পণ্য একসাথে =====
r = await call(P, 'GET', '/api/products');
const shops = new Set(r.j.products.filter((p) => p.shop).map((p) => p.shop));
t(r.j.products.some((p) => p.id === pA && p.shop === 'Shop A') && r.j.products.some((p) => p.id === pB && p.shop === 'Shop B'), 'পাবলিক /api/products-এ A ও B উভয়ের পণ্য + দোকানের নাম');
t(r.j.products.some((p) => p.id === platformProd.id && !p.shop), 'পুরোনো পণ্য আগের মতোই (shop ছাড়া)');
t(!JSON.stringify(r.j).includes('a@shop.com') && !JSON.stringify(r.j).includes('password'), 'পাবলিক API-তে Seller-এর ইমেইল/পাসওয়ার্ড নেই');

// ===== চেকআউট: একই কার্টে একাধিক Seller =====
db.raw.prepare('UPDATE products SET stock = 100 WHERE id = ?').run(pB);
const cust = { name: 'Rahim Uddin', phone: '01712345678', address: 'House 1, Road 2, Dhaka 1207', district: 'ঢাকা', payment: 'ক্যাশ অন ডেলিভারি' };
r = await call(ORD, 'POST', '/api/orders', { body: { ...cust, cart: [{ id: pA, qty: 2 }, { id: pB, qty: 1 }, { id: platformProd.id, qty: 1 }], price: 1, total: 1 }, ip: '2.2.2.2' });
t(r.s === 200 && r.j.orderNo, 'একই কার্টে Seller A + Seller B + প্ল্যাটফর্ম — অর্ডার সফল: ' + (r.j.error || ''));
const pAprice = db.raw.prepare('SELECT price FROM products WHERE id=?').get(pA).price;
const expectSub = pAprice * 2 + 555 + platformProd.price;
t(r.j.subtotal === expectSub, 'সার্ভার-হিসাব করা সাবটোটাল সঠিক (ব্রাউজারের দাম উপেক্ষিত)');
const orderId = db.raw.prepare('SELECT id FROM orders WHERE order_no=?').get(r.j.orderNo).id;
const lines = db.raw.prepare('SELECT product_id, seller_id, qty, line_total FROM order_items WHERE order_id=? ORDER BY id').all(orderId);
t(lines.length === 3 && lines[0].seller_id === A && lines[1].seller_id === B && lines[2].seller_id === null, 'order_items-এ প্রতি লাইনে সঠিক seller_id');
// একই অর্ডার আরেকটা
r = await call(ORD, 'POST', '/api/orders', { body: { ...cust, cart: [{ id: pA, qty: 1 }], }, ip: '2.2.2.3' });
t(r.s === 200, 'শুধু A-এর পণ্যের দ্বিতীয় অর্ডার'); const order2 = db.raw.prepare('SELECT id FROM orders WHERE order_no=?').get(r.j.orderNo).id;

// ===== Seller অর্ডার ভিউ =====
r = await call(SOrd, 'GET', '/api/seller/orders', { headers: HB });
t(r.s === 403, 'B-এর order পারমিশন নেই → 403');
r = await call(SOrd, 'GET', '/api/seller/orders', { headers: HA });
t(r.s === 200 && r.j.orders.length === 2, 'A দুটি অর্ডার দেখে');
const o1 = r.j.orders.find((o) => o.order_id === orderId);
t(o1.items.length === 1 && o1.items[0].product_id === pA && o1.my_total === pAprice * 2, 'A শুধু নিজের লাইন ও নিজের মোট দেখে');
t(!JSON.stringify(r.j).includes('Shop B') && !JSON.stringify(o1).includes('555') , 'A অন্য Seller-এর লাইন/দাম দেখে না');
t(o1.customer.phone === '01712345678' && o1.customer.address && !('email' in o1.customer) && !('customer_id' in o1) && !('total' in o1) && !('coupon_code' in o1), 'কাস্টমারের শুধু ডেলিভারি-তথ্য; ইমেইল/অ্যাকাউন্ট/মোট বিল নেই');
await call(ASel, 'PATCH', '/api/admin/sellers', { headers: AH, body: { id: B, permissions: { can_order_manage: true } } });
r = await call(SOrd, 'GET', '/api/seller/orders', { headers: HB });
t(r.s === 200 && r.j.orders.length === 1 && r.j.orders[0].items[0].product_id === pB, 'B শুধু নিজের অংশ দেখে');
r = await call(SOrd, 'GET', '/api/seller/orders?q=' + encodeURIComponent("' OR '1'='1"), { headers: HA });
t(r.s === 200 && r.j.orders.length === 0, 'সার্চে SQL-injection কাজ করে না');

// আপডেট ও ownership
r = await call(SOrd, 'PATCH', '/api/seller/orders', { headers: HB, body: { order_id: order2, status: 'cancelled' } });
t(r.s === 404 && db.raw.prepare("SELECT status FROM order_items WHERE order_id=?").get(order2).status === 'pending', 'B এমন অর্ডার বদলাতে পারে না যেখানে তার পণ্য নেই');
r = await call(SOrd, 'PATCH', '/api/seller/orders', { headers: HB, body: { order_id: orderId, status: 'shipped', courier: 'Pathao', tracking_id: 'T123' } });
t(r.s === 200, 'B নিজের অংশ shipped করে');
const st = db.raw.prepare('SELECT seller_id,status,courier FROM order_items WHERE order_id=? ORDER BY id').all(orderId);
t(st[0].status === 'pending' && st[1].status === 'shipped' && st[1].courier === 'Pathao' && st[2].status === 'pending', 'শুধু B-এর লাইন বদলেছে; A ও প্ল্যাটফর্মের লাইন অক্ষত');
t(db.raw.prepare('SELECT status FROM orders WHERE id=?').get(orderId).status === 'shipped', 'মিশ্র অবস্থায় মূল অর্ডার "shipped" (রোলআপ)');
r = await call(SOrd, 'PATCH', '/api/seller/orders', { headers: HA, body: { order_id: orderId, status: 'bogus' } });
t(r.s === 400, 'অবৈধ status আটকায়');
r = await call(SOrd, 'PATCH', '/api/seller/orders', { headers: HA, body: { order_id: orderId, payment_status: 'paid' } });
t(r.s === 400 && db.raw.prepare('SELECT payment_status FROM orders WHERE id=?').get(orderId).payment_status === 'unpaid', 'Seller payment_status বদলাতে পারে না');
r = await call(SOrd, 'PATCH', '/api/seller/orders', { headers: HA, body: { order_id: order2, status: 'delivered' } });
t(db.raw.prepare('SELECT status FROM orders WHERE id=?').get(order2).status === 'delivered', 'একমাত্র Seller delivered করলে মূল অর্ডারও delivered');

// ===== Super Admin: অর্ডার ভিউ ও ক্যাসকেড =====
r = await call(AOrd, 'GET', '/api/admin/orders', { headers: AH });
const ao = r.j.orders.find((o) => o.id === orderId);
t(ao && ao.sub_items.length === 3 && ao.sub_items.some((x) => x.shop === 'Shop A') && ao.sub_items.some((x) => x.shop === 'প্ল্যাটফর্ম'), 'Super Admin সব Seller-এর সাব-অর্ডার দেখে');
r = await call(AOrd, 'PATCH', '/api/admin/orders', { headers: AH, body: { id: orderId, status: 'cancelled' } });
t(db.raw.prepare("SELECT COUNT(*) c FROM order_items WHERE order_id=? AND status='cancelled'").get(orderId).c === 3, 'Super Admin বাতিল করলে সব Seller-লাইন বাতিল');

// ===== রিপোর্ট =====
r = await call(SRep, 'GET', '/api/seller/reports', { headers: HB });
t(r.s === 403, 'B-এর sales-report পারমিশন নেই → 403');
r = await call(SRep, 'GET', '/api/seller/reports', { headers: HA });
t(r.s === 200 && r.j.totals.orders === 1 && r.j.totals.revenue === pAprice && r.j.totals.units === 1, 'A-এর রিপোর্ট: বাতিল অর্ডার বাদ, শুধু নিজের বিক্রি ধরা');
r = await call(SRep, 'GET', '/api/seller/reports?from=2026-13-99x', { headers: HA });
t(r.s === 400, 'অবৈধ তারিখ আটকায়');

// ===== Suspend / পাসওয়ার্ড রিসেট / ডিলিট =====
r = await call(ASel, 'PATCH', '/api/admin/sellers', { headers: AH, body: { id: B, status: 'suspended' } });
r = await call(SProd, 'GET', '/api/seller/products', { headers: HB });
t(r.s === 401 || r.s === 403, 'suspend করলে B-এর চলমান সেশন সাথে সাথে বন্ধ');
r = await call(SLogin, 'POST', '/api/seller/login', { body: { email: 'b@shop.com', password: 'passwordB123' }, ip: '5.5.5.5' });
t(r.s === 403, 'suspended Seller লগইন করতে পারে না');
r = await call(P, 'GET', '/api/products');
t(!r.j.products.some((p) => p.id === pB) && r.j.products.some((p) => p.id === pA), 'suspended Seller-এর পণ্য স্টোরে লুকানো; অন্যেরটা দেখা যায়');
r = await call(ORD, 'POST', '/api/orders', { body: { ...cust, cart: [{ id: pB, qty: 1 }] }, ip: '2.2.2.4' });
t(r.s === 409, 'suspended Seller-এর পণ্য অর্ডার করা যায় না');
await call(ASel, 'PATCH', '/api/admin/sellers', { headers: AH, body: { id: B, status: 'active' } });
r = await call(P, 'GET', '/api/products');
t(r.j.products.some((p) => p.id === pB), 'আবার active করলে পণ্য ফিরে আসে (ডেটা নষ্ট হয়নি)');
r = await call(ASel, 'PATCH', '/api/admin/sellers', { headers: AH, body: { id: A, password: 'newPassword123' } });
r = await call(SMe, 'GET', '/api/seller/me', { headers: HA });
t(r.s === 401, 'পাসওয়ার্ড রিসেটে পুরোনো সেশন বাতিল');
r = await call(SLogin, 'POST', '/api/seller/login', { body: { email: 'a@shop.com', password: 'newPassword123' }, ip: '6.6.6.6' });
t(r.s === 200, 'নতুন পাসওয়ার্ডে লগইন'); const HA2 = { 'X-Seller-Token': r.j.token };
r = await call(ASel, 'DELETE', '/api/admin/sellers?id=' + A, { headers: AH });
t(r.s === 409 && !!db.raw.prepare('SELECT id FROM sellers WHERE id=?').get(A), 'পণ্য/অর্ডার থাকা Seller মুছা যায় না (ডেটা সুরক্ষিত)');
r = await call(ASel, 'POST', '/api/admin/sellers', { headers: AH, body: { shop_name: 'Empty', email: 'e@shop.com', password: 'passwordE123' } });
r = await call(ASel, 'DELETE', '/api/admin/sellers?id=' + r.j.id, { headers: AH });
t(r.s === 200, 'পণ্য/অর্ডারহীন Seller মুছা যায়');
r = await call(SLogout, 'POST', '/api/seller/logout', { headers: HA2 });
r = await call(SMe, 'GET', '/api/seller/me', { headers: HA2 });
t(r.s === 401, 'লগআউটের পর টোকেন অচল');

// ===== Seller নিজের পণ্য ডিলিট (FK সহ) =====
r = await call(SLogin, 'POST', '/api/seller/login', { body: { email: 'a@shop.com', password: 'newPassword123' }, ip: '6.6.6.7' }); const HA3 = { 'X-Seller-Token': r.j.token };
await call(SStock, 'POST', '/api/seller/stock', { headers: HA3, body: { product_id: pA, change: 1 } });
r = await call(SProd, 'DELETE', '/api/seller/products?id=' + pA, { headers: HA3 });
t(r.s === 200 && !db.raw.prepare('SELECT id FROM products WHERE id=?').get(pA), 'A নিজের পণ্য (স্টক-ইতিহাসসহ) মুছতে পারে');
t(db.raw.prepare('SELECT COUNT(*) c FROM order_items WHERE seller_id=?').get(A).c >= 2, 'পণ্য মুছলেও পুরোনো অর্ডারের রেকর্ড অক্ষত');

// ===== ছবি: ফোল্ডার ও ডিলিট নিরাপত্তা =====
r = await call(SUp, 'DELETE', '/api/seller/upload?public_id=nextgentechbd/sellers/999/products/x', { headers: HA3 });
t(r.s === 501 || r.s === 403, 'API key/secret ছাড়া ছবি-ডিলিট সরানো যায় না (501)');
const env2 = { ...env, CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' };
const reqDel = (pid) => SUp.onRequestDelete({ request: new Request('https://x.test/api/seller/upload?public_id=' + encodeURIComponent(pid), { method: 'DELETE', headers: { ...HA3 } }), env: env2 });
let rr = await reqDel('nextgentechbd/sellers/' + B + '/products/x'); t(rr.status === 403, 'A, B-এর ফোল্ডারের ছবি মুছতে পারে না');
rr = await reqDel('nextgentechbd/products/shared'); t(rr.status === 403, 'A, প্ল্যাটফর্মের ছবি মুছতে পারে না');
rr = await reqDel('nextgentechbd/sellers/' + A + '/products/../../products/x'); t(rr.status === 403, 'path-traversal আটকায়');
const imgUrl = 'https://res.cloudinary.com/democloud/image/upload/v1/nextgentechbd/sellers/' + A + '/products/used1.jpg';
await call(SProd, 'POST', '/api/seller/products', { headers: HA3, body: { ...base, name: 'with img', img: imgUrl } });
rr = await reqDel('nextgentechbd/sellers/' + A + '/products/used1'); t(rr.status === 409, 'ব্যবহৃত ছবি মোছা যায় না');

console.log(`API/সিকিউরিটি টেস্ট: ${pass} পাস, ${fail} ফেল`);
process.exit(fail ? 1 : 0);
