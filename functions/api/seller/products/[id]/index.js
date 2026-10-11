// GET/PUT/DELETE /api/seller/products/:id — ownership প্রতিটি কুয়েরিতে (WHERE id = ? AND seller_id = ?)।
// অন্যের পণ্য আইডি দিলেও 404 (অস্তিত্বই প্রকাশ পায় না → IDOR নেই)।
import { json, err } from '../../../../_lib/utils.js';
import { requireSeller } from '../../../../_lib/auth.js';
import { parseId } from '../../../../_lib/sellers.js';
import { validateProduct, selectProducts, outProduct, isMissingColumn } from '../../../../_lib/seller-products.js';

const NOT_FOUND = () => err('পণ্য পাওয়া যায়নি', 404);

export async function onRequestGet({ request, env, params }) {
  const auth = await requireSeller(request, env, { permission: 'products:read' });
  if (auth.response) return auth.response;
  const id = parseId(params.id); if (!id) return NOT_FOUND();
  const res = await selectProducts(env, (cols) => `SELECT ${cols} FROM products WHERE id = ? AND seller_id = ?`, [id, auth.seller.id]);
  const p = (res.results || [])[0];
  return p ? json({ product: outProduct(p) }) : NOT_FOUND();
}

export async function onRequestPut({ request, env, params }) {
  const auth = await requireSeller(request, env, { permission: 'products:write', needSubscription: true });
  if (auth.response) return auth.response;
  const id = parseId(params.id); if (!id) return NOT_FOUND();
  let b; try { b = await request.json(); } catch (e) { return err('অবৈধ রিকোয়েস্ট', 400); }
  const cur = await env.DB.prepare('SELECT price, stock FROM products WHERE id = ? AND seller_id = ?').bind(id, auth.seller.id).first();
  if (!cur) return NOT_FOUND();
  const v = await validateProduct(env, b || {}, { partial: true });
  if (v.error) return err(v.error, 400);
  const d = v.data;
  if (d.old && d.old < (d.price !== undefined ? d.price : cur.price)) return err('পুরনো মূল্য বর্তমান মূল্যের চেয়ে কম হতে পারে না', 400);
  // শুধু অনুমোদিত কলাম (allow-list) — seller_id/r/rv/sold কখনো নয়
  const allowed = ['cat', 'name', 'name_en', 'price', 'old', 'e', 'img', 'tag', 'f', 'featured', 'description', 'colors', 'sizes', 'sku', 'stock', 'low_stock_at', 'status'];
  let keys = allowed.filter((k) => d[k] !== undefined);
  if (!keys.length) return err('পরিবর্তনের মতো কিছু পাঠানো হয়নি', 400);
  const upd = (ks) => env.DB.prepare(`UPDATE products SET ${ks.map((k) => k + ' = ?').join(', ')}, updated_at = datetime('now') WHERE id = ? AND seller_id = ?`).bind(...ks.map((k) => d[k]), id, auth.seller.id);
  // মাইগ্রেশন ০১০ (description/featured) না চললে বাকি ফিল্ড ঠিকই সংরক্ষিত হয়
  try { await env.DB.prepare('SELECT description, featured FROM products LIMIT 1').first(); } catch (e) { if (!isMissingColumn(e)) throw e; keys = keys.filter((k) => k !== 'description' && k !== 'featured'); }
  if (!keys.length) return err('পরিবর্তনের মতো কিছু পাঠানো হয়নি', 400);
  const stmts = [upd(keys)];
  if (d.stock !== undefined && d.stock !== null && d.stock !== cur.stock) {
    stmts.push(env.DB.prepare('INSERT INTO stock_history (product_id, change, reason, seller_id, changed_by) VALUES (?, ?, ?, ?, ?)')
      .bind(id, d.stock - (cur.stock || 0), 'এডিটে স্টক সংশোধন', auth.seller.id, 'seller:' + auth.seller.id));
  }
  await env.DB.batch(stmts);
  return json({ ok: true, id });
}

// ডিলিট সবসময় অনুমোদিত (ট্রায়াল শেষ হলেও সেলার নিজের পণ্য সরাতে পারবে)।
// যে পণ্য কোনো অর্ডারে আছে সেটা সত্যিই মুছলে অর্ডার-ইতিহাসের সম্পর্ক (FK) ভাঙে — তাই সেটা মোছার বদলে 'inactive' (আর্কাইভ) করা হয়;
// অর্ডারবিহীন পণ্য স্টক-ইতিহাস ও রিভিউসহ মুছে যায়।
export async function onRequestDelete({ request, env, params }) {
  const auth = await requireSeller(request, env, { permission: 'products:write' });
  if (auth.response) return auth.response;
  const id = parseId(params.id); if (!id) return NOT_FOUND();
  const own = await env.DB.prepare('SELECT id FROM products WHERE id = ? AND seller_id = ?').bind(id, auth.seller.id).first();
  if (!own) return NOT_FOUND();
  const used = await env.DB.prepare('SELECT COUNT(*) AS c FROM order_items WHERE product_id = ?').bind(id).first();
  if (used && used.c > 0) {
    await env.DB.prepare(`UPDATE products SET status = 'inactive', updated_at = datetime('now') WHERE id = ? AND seller_id = ?`).bind(id, auth.seller.id).run();
    return json({ ok: true, archived: true, message: 'এই পণ্যের অর্ডার আছে, তাই মোছার বদলে নিষ্ক্রিয় (আর্কাইভ) করা হয়েছে' });
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM stock_history WHERE product_id = ?').bind(id),
    env.DB.prepare('DELETE FROM reviews WHERE product_id = ?').bind(id),
    env.DB.prepare('DELETE FROM products WHERE id = ? AND seller_id = ?').bind(id, auth.seller.id),
  ]);
  return json({ ok: true });
}
