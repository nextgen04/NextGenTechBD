import fs from 'node:fs';
import { makeDB } from './d1shim.mjs';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✖ FAIL:', m); } };
const q = (db, s) => db.raw.prepare(s).all();

// ---- ১) বিদ্যমান (পুরোনো) প্রোডাকশন-সদৃশ DB: আগের schema + seed + কিছু পুরোনো অর্ডার/কাস্টমার ----
const old = makeDB();
old.exec(fs.readFileSync('fixtures/old_schema.sql', 'utf8'));
old.exec(fs.readFileSync('fixtures/seed.sql', 'utf8'));
old.exec(`INSERT INTO customers (name, phone, password_hash, password_salt) VALUES ('Old Cust','01711111111','h','s');
INSERT INTO orders (order_no, customer_id, name, phone, address, items, subtotal, delivery_fee, total, status) VALUES ('SB00000001',1,'Old Cust','01711111111','Dhaka old address','["x"]',500,60,560,'delivered');
INSERT INTO stock_history (product_id, change, reason) VALUES (1, 5, 'old');`);
const snap = (db) => ({
  products: JSON.stringify(q(db, 'SELECT id,cat,name,price,old,e,img,r,rv,sold,tag,f,colors,sizes,sku,stock,low_stock_at FROM products ORDER BY id')),
  orders: JSON.stringify(q(db, 'SELECT * FROM orders ORDER BY id')),
  customers: JSON.stringify(q(db, 'SELECT * FROM customers')),
  cats: JSON.stringify(q(db, 'SELECT * FROM categories')),
  settings: JSON.stringify(q(db, 'SELECT * FROM settings')),
  stock: JSON.stringify(q(db, 'SELECT * FROM stock_history')),
});
const before = snap(old);
const nProducts = q(old, 'SELECT COUNT(*) c FROM products')[0].c;
ok(nProducts > 0, 'seed এ পণ্য আছে (' + nProducts + ')');

old.exec(fs.readFileSync('fixtures/m009.sql', 'utf8'));
const after = snap(old);
for (const k of Object.keys(before)) ok(before[k] === after[k], `মাইগ্রেশনের পর '${k}' ডেটা হুবহু অপরিবর্তিত`);
ok(q(old, 'SELECT COUNT(*) c FROM products WHERE seller_id IS NULL')[0].c === nProducts, 'পুরোনো সব পণ্যের seller_id = NULL (প্ল্যাটফর্মের)');
for (const t of ['sellers', 'seller_sessions', 'order_items']) ok(q(old, `SELECT name FROM sqlite_master WHERE name='${t}'`).length === 1, `${t} টেবিল তৈরি হয়েছে`);
ok(q(old, 'PRAGMA foreign_key_check').length === 0, 'foreign key সমস্যা নেই');

// ---- ২) নতুন সাইট: নতুন schema.sql একবারে ----
const fresh = makeDB();
fresh.exec(fs.readFileSync('fixtures/new_schema.sql', 'utf8'));
const cols = (db, t) => q(db, `PRAGMA table_info(${t})`).map((c) => c.name).sort().join(',');
for (const t of ['products', 'sellers', 'seller_sessions', 'order_items', 'orders'])
  ok(cols(fresh, t) === cols(old, t), `${t}: নতুন schema.sql ও মাইগ্রেটেড DB-র কলাম একই`);
// schema.sql দুইবার চালালেও এরর নয় (IF NOT EXISTS)
try { fresh.exec(fs.readFileSync('fixtures/new_schema.sql', 'utf8')); ok(true, ''); } catch (e) { ok(false, 'schema.sql দ্বিতীয়বার এরর: ' + e.message); }
console.log(`মাইগ্রেশন টেস্ট: ${pass} পাস, ${fail} ফেল`);
process.exit(fail ? 1 : 0);
