// চেকআউটে স্টক কমা, ওভারসেল প্রতিরোধ, বাতিলে ফেরত
import fs from 'node:fs';
import { makeDB } from './d1shim.mjs';
import * as ORD from './build/functions/api/orders.js';
import * as AOrd from './build/functions/api/admin/orders.js';
import * as SOrd from './build/functions/api/seller/orders.js';
import { sha256Hex } from './build/functions/_lib/utils.js';
let pass = 0, fail = 0; const t = (c, m) => { if (c) pass++; else { fail++; console.log('  ✖ FAIL:', m); } };
const db = makeDB(); db.exec(fs.readFileSync('fixtures/old_schema.sql', 'utf8')); db.exec(fs.readFileSync('fixtures/seed.sql', 'utf8')); db.exec(fs.readFileSync('fixtures/m009.sql', 'utf8'));
const env = { DB: db }; let ipn = 10;
const call = async (mod, m, path, body, headers = {}) => { const req = new Request('https://x.test' + path, { method: m, headers: { 'CF-Connecting-IP': '4.4.' + (ipn++) + '.1', 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined }); const res = await mod['onRequest' + m[0] + m.slice(1).toLowerCase()]({ request: req, env }); return { s: res.status, j: await res.json().catch(() => ({})) }; };
const tok = 'c'.repeat(64); db.raw.prepare('INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?,?)').run(await sha256Hex(tok), new Date(Date.now() + 36e5).toISOString());
const AH = { 'X-Admin-Key': tok };
const stk = (id) => db.raw.prepare('SELECT stock FROM products WHERE id=?').get(id).stock;
const cat = db.raw.prepare('SELECT id FROM categories LIMIT 1').get().id;
// Seller + পণ্য
const { hash, salt } = { hash: 'h', salt: 's' };
db.raw.prepare("INSERT INTO sellers (shop_name,email,password_hash,password_salt,can_order_manage) VALUES ('S','s@x.com',?,?,1)").run(hash, salt);
const stok = 'd'.repeat(64); db.raw.prepare('INSERT INTO seller_sessions (token_hash,seller_id,expires_at) VALUES (?,1,?)').run(await sha256Hex(stok), new Date(Date.now() + 36e5).toISOString());
const SH = { 'X-Seller-Token': stok };
const mk = (name, stock, seller) => Number(db.raw.prepare('INSERT INTO products (cat,name,price,r,rv,sold,stock,seller_id) VALUES (?,?,100,0,0,0,?,?)').run(cat, name, stock, seller).lastInsertRowid);
const P1 = mk('P1', 10, 1), P2 = mk('P2', 3, null), P3 = mk('P3', null, null), P4 = mk('P4', 5, 1);
const cust = { name: 'Rahim Uddin', phone: '01712345678', address: 'House 1, Road 2, Dhaka 1207', district: 'ঢাকা' };
const order = (cart) => call(ORD, 'POST', '/api/orders', { ...cust, cart });
let r = await order([{ id: P1, qty: 4 }, { id: P3, qty: 2 }]);
t(r.s === 200 && stk(P1) === 6, 'অর্ডারে স্টক কমে (10→6)'); const o1 = r.j.orderNo;
t(stk(P3) === null, 'স্টক ট্র্যাক না হওয়া পণ্য (NULL) অপরিবর্তিত');
t(db.raw.prepare("SELECT change FROM stock_history WHERE product_id=? AND reason LIKE ?").get(P1, '%' + o1)?.change === -4, 'স্টক-হিস্টোরিতে অডিট এন্ট্রি');
r = await order([{ id: P1, qty: 7 }]); t(r.s === 409 && stk(P1) === 6, 'স্টকের বেশি চাইলে 409, স্টক অপরিবর্তিত');
r = await order([{ id: P4, qty: 3 }, { id: P1, qty: 7 }]); t(r.s === 409 && stk(P4) === 5 && stk(P1) === 6, 'দ্বিতীয় লাইনে স্টক কম হলে প্রথমটির কাটা স্টক ফেরত (কিছুই কাটেনি)');
const nOrd = db.raw.prepare('SELECT COUNT(*) c FROM orders').get().c; t(nOrd === 1, 'ব্যর্থ অর্ডার সেভ হয়নি');
// শেষ ৬টি একসাথে: দুটি ৪-এর অর্ডার — একটিই সফল
const [a, b] = await Promise.all([order([{ id: P1, qty: 4 }]), order([{ id: P1, qty: 4 }])]);
t([a.s, b.s].sort().join() === '200,409' && stk(P1) === 2, 'একসাথে দুটি অর্ডারে ওভারসেল হয় না (শেষ স্টক ২)');
// বাতিলে ফেরত — Seller
const sid = db.raw.prepare('SELECT order_id FROM orders o JOIN order_items i ON i.order_id=o.id WHERE o.order_no=? LIMIT 1').get(o1).order_id;
r = await call(SOrd, 'PATCH', '/api/seller/orders', { order_id: sid, status: 'cancelled' }, SH);
t(r.s === 200 && stk(P1) === 6, 'Seller বাতিল করলে স্টক ফেরত (২+৪=৬)');
r = await call(SOrd, 'PATCH', '/api/seller/orders', { order_id: sid, status: 'cancelled' }, SH);
t(stk(P1) === 6, 'দ্বিতীয়বার বাতিলে স্টক দ্বিগুণ ফেরত হয় না');
r = await call(AOrd, 'PATCH', '/api/admin/orders', { id: sid, status: 'cancelled' }, AH);
t(stk(P1) === 6, 'Admin আবার বাতিল করলেও দ্বিগুণ নয়');
// Admin বাতিল — নতুন অর্ডার
r = await order([{ id: P4, qty: 2 }, { id: P1, qty: 1 }]); const o3 = db.raw.prepare('SELECT id FROM orders WHERE order_no=?').get(r.j.orderNo).id;
t(stk(P4) === 3 && stk(P1) === 5, 'নতুন অর্ডারে স্টক কমল');
await call(AOrd, 'PATCH', '/api/admin/orders', { id: o3, status: 'cancelled' }, AH);
t(stk(P4) === 5 && stk(P1) === 6, 'Admin বাতিলে সব লাইনের স্টক ফেরত');
// ডেলিভারি হলে ফেরত নয়
r = await order([{ id: P4, qty: 1 }]); const o4 = db.raw.prepare('SELECT id FROM orders WHERE order_no=?').get(r.j.orderNo).id;
await call(AOrd, 'PATCH', '/api/admin/orders', { id: o4, status: 'delivered' }, AH);
t(stk(P4) === 4, 'delivered করলে স্টক ফেরত হয় না');
// রিটার্নেও ফেরত (একবারই)
r = await order([{ id: P4, qty: 2 }]); const o5 = db.raw.prepare('SELECT id FROM orders WHERE order_no=?').get(r.j.orderNo).id; const before = stk(P4);
await call(SOrd, 'PATCH', '/api/seller/orders', { order_id: o5, status: 'returned' }, SH);
t(stk(P4) === before + 2, 'returned হলে স্টক ফেরত');
await call(AOrd, 'PATCH', '/api/admin/orders', { id: o5, status: 'cancelled' }, AH);
t(stk(P4) === before + 2, 'returned-এর পর cancelled করলেও দ্বিগুণ ফেরত নয়');
console.log(`স্টক টেস্ট: ${pass} পাস, ${fail} ফেল`); process.exit(fail ? 1 : 0);
