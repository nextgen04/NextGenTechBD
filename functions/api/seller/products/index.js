// GET  /api/seller/products  → শুধু নিজের পণ্য (?q=, ?status=, ?low_stock=1)
// POST /api/seller/products  → নতুন পণ্য (seller_id সবসময় সেশন থেকে; ট্রায়াল/সাবস্ক্রিপশন সচল থাকতে হবে)
import { json, err } from '../../../_lib/utils.js';
import { requireSeller } from '../../../_lib/auth.js';
import { validateProduct, selectProducts, outProduct, isMissingColumn } from '../../../_lib/seller-products.js';

export async function onRequestGet({ request, env }) {
  const auth = await requireSeller(request, env, { permission: 'products:read' });
  if (auth.response) return auth.response;
  const u = new URL(request.url);
  const q = (u.searchParams.get('q') || '').trim().slice(0, 60);
  const status = u.searchParams.get('status');
  let tail = ' FROM products WHERE seller_id = ?'; const args = [auth.seller.id];
  if (q) { tail += ' AND (name LIKE ? OR name_en LIKE ? OR sku LIKE ?)'; const l = `%${q.replace(/[%_]/g, '')}%`; args.push(l, l, l); }
  if (['active', 'inactive', 'draft'].includes(status)) { tail += ' AND status = ?'; args.push(status); }
  if (u.searchParams.get('low_stock') === '1') tail += ' AND stock IS NOT NULL AND stock <= low_stock_at';
  tail += ' ORDER BY id DESC LIMIT 500';
  const res = await selectProducts(env, (cols) => 'SELECT ' + cols + tail, args);
  return json({ products: (res.results || []).map(outProduct), subscription: auth.subscription });
}

export async function onRequestPost({ request, env }) {
  const auth = await requireSeller(request, env, { permission: 'products:write', needSubscription: true });
  if (auth.response) return auth.response;
  let b; try { b = await request.json(); } catch (e) { return err('অবৈধ রিকোয়েস্ট', 400); }
  const v = await validateProduct(env, b || {});
  if (v.error) return err(v.error, 400);
  const d = { status: 'active', f: 0, low_stock_at: 5, stock: null, old: null, ...v.data };
  const base = [auth.seller.id, d.cat, d.name, d.name_en || null, d.price, d.old, d.e || null, d.img || null, d.tag || null, d.f,
    d.colors || null, d.sizes || null, d.sku || null, d.stock, d.low_stock_at, d.status];
  let r;
  try {
    r = await env.DB.prepare(
      `INSERT INTO products (seller_id, cat, name, name_en, price, old, e, img, tag, f, colors, sizes, sku, stock, low_stock_at, status, description, featured, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(...base, d.description || null, d.featured || 0).run();
  } catch (e) {
    if (!isMissingColumn(e)) throw e;   // মাইগ্রেশন ০১০ না চললে বিবরণ/ফিচার্ড ছাড়াই সংরক্ষণ
    r = await env.DB.prepare(
      `INSERT INTO products (seller_id, cat, name, name_en, price, old, e, img, tag, f, colors, sizes, sku, stock, low_stock_at, status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(...base).run();
  }
  const id = r.meta.last_row_id;
  if (d.stock) await env.DB.prepare('INSERT INTO stock_history (product_id, change, reason, seller_id, changed_by) VALUES (?, ?, ?, ?, ?)')
    .bind(id, d.stock, 'প্রাথমিক স্টক', auth.seller.id, 'seller:' + auth.seller.id).run();
  return json({ ok: true, id }, 201);
}
