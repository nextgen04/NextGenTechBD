// /api/admin/products/transfer — Super Admin: পণ্য এক সেলার থেকে অন্য সেলারে ট্রান্সফার (অডিটসহ)
// POST { product_ids: [..] (সর্বোচ্চ ১০০) অথবা product_id, new_seller_id, note? }
// GET  ?product_id=123 অথবা ?seller_id=5 → ট্রান্সফারের ইতিহাস
// নিয়ম: পণ্যের রিভিউ নতুন মালিকের সাথে যায়; চলমান/পুরনো order_items আগের সেলারের কাছেই থাকে (ফুলফিলমেন্ট ও বিক্রির হিসাব অপরিবর্তিত);
//        স্টক-ইতিহাস আগের এন্ট্রিগুলো আগের সেলারের নামেই থাকে।
import { json, err } from '../../../_lib/utils.js';
import { requireAdmin } from '../../../_lib/auth.js';
import { parseId, cleanText } from '../../../_lib/sellers.js';

export async function onRequestGet({ request, env }) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const u = new URL(request.url);
  const pid = parseId(u.searchParams.get('product_id')); const sid = parseId(u.searchParams.get('seller_id'));
  let sql = `SELECT t.id, t.product_id, p.name AS product_name, t.previous_seller_id, a.store_name AS previous_store, t.new_seller_id, b.store_name AS new_store, t.changed_by, t.note, t.changed_at
    FROM product_transfers t LEFT JOIN products p ON p.id = t.product_id LEFT JOIN sellers a ON a.id = t.previous_seller_id LEFT JOIN sellers b ON b.id = t.new_seller_id`;
  const w = [], args = [];
  if (pid) { w.push('t.product_id = ?'); args.push(pid); }
  if (sid) { w.push('(t.previous_seller_id = ? OR t.new_seller_id = ?)'); args.push(sid, sid); }
  if (w.length) sql += ' WHERE ' + w.join(' AND ');
  const res = await env.DB.prepare(sql + ' ORDER BY t.id DESC LIMIT 200').bind(...args).all();
  return json({ transfers: res.results || [] });
}

export async function onRequestPost({ request, env }) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  let b; try { b = await request.json(); } catch (e) { return err('অবৈধ রিকোয়েস্ট', 400); }
  b = b || {};
  const ids = [...new Set((Array.isArray(b.product_ids) ? b.product_ids : [b.product_id]).map(parseId).filter(Boolean))];
  if (!ids.length) return err('কমপক্ষে একটি পণ্য বাছাই করুন', 400);
  if (ids.length > 100) return err('একবারে সর্বোচ্চ ১০০টি পণ্য ট্রান্সফার করা যায়', 400);
  const newId = parseId(b.new_seller_id);
  if (!newId) return err('নতুন সেলার বাছাই করুন', 400);
  const target = await env.DB.prepare('SELECT id, store_name FROM sellers WHERE id = ? AND deleted_at IS NULL').bind(newId).first();
  if (!target) return err('নতুন সেলার পাওয়া যায়নি (অথবা মুছে ফেলা হয়েছে)', 404);
  const note = cleanText(b.note, 300) || null;

  const stmts = []; let moved = 0, skipped = 0;
  for (const id of ids) {
    const p = await env.DB.prepare('SELECT id, seller_id FROM products WHERE id = ?').bind(id).first();
    if (!p || p.seller_id === newId) { skipped++; continue; }
    stmts.push(env.DB.prepare('INSERT INTO product_transfers (product_id, previous_seller_id, new_seller_id, changed_by, note) VALUES (?, ?, ?, ?, ?)').bind(id, p.seller_id, newId, 'super_admin', note));
    stmts.push(env.DB.prepare(`UPDATE products SET seller_id = ?, updated_at = datetime('now') WHERE id = ?`).bind(newId, id));
    stmts.push(env.DB.prepare('UPDATE reviews SET seller_id = ? WHERE product_id = ?').bind(newId, id));
    moved++;
  }
  if (stmts.length) await env.DB.batch(stmts);   // সব-অথবা-কিছুই-না
  return json({ ok: true, moved, skipped, to: target.store_name });
}
