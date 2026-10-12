// চেকআউটে অটো-স্টক কমানো ও বাতিল/রিটার্নে স্টক ফেরত।
// 🔒 স্টক কমানো একটাই অ্যাটমিক SQL ("stock >= qty" শর্তসহ) — একসাথে অনেকে কিনলেও স্টক ০-র নিচে যায় না, ওভারসেল হয় না।
// stock = NULL মানে "ট্র্যাক হয় না" — সেগুলো ছোঁয়া হয় না।

// lines: [{ p:{id,name}, qty }] — সফল হলে { ok:true, claimed:[{id,qty}] }, কোনোটি ব্যর্থ হলে আগেরগুলো ফেরত দিয়ে { ok:false, name }
export async function claimStock(env, lines) {
  const claimed = [];
  for (const l of lines) {
    const r = await env.DB.prepare(
      'UPDATE products SET stock = stock - ? WHERE id = ? AND stock IS NOT NULL AND stock >= ?'
    ).bind(l.qty, l.p.id, l.qty).run();
    if (r.meta && r.meta.changes) { claimed.push({ id: l.p.id, qty: l.qty }); continue; }
    const cur = await env.DB.prepare('SELECT stock FROM products WHERE id = ?').bind(l.p.id).first();
    if (cur && cur.stock === null) continue; // স্টক ট্র্যাক হয় না
    await releaseClaims(env, claimed);
    return { ok: false, name: l.p.name };
  }
  return { ok: true, claimed };
}

export async function releaseClaims(env, claimed) {
  for (const c of claimed || []) {
    try { await env.DB.prepare('UPDATE products SET stock = stock + ? WHERE id = ? AND stock IS NOT NULL').bind(c.qty, c.id).run(); } catch (e) { /* ignore */ }
  }
}

export async function logOrderStock(env, claimed, orderNo) {
  try {
    await env.DB.batch((claimed || []).map((c) =>
      env.DB.prepare('INSERT INTO stock_history (product_id, change, reason) VALUES (?, ?, ?)').bind(c.id, -c.qty, 'অর্ডার ' + orderNo)));
  } catch (e) { /* ইতিহাস ব্যর্থ হলেও অর্ডার আটকায় না */ }
}

// বাতিল/রিটার্ন হওয়া লাইনের স্টক একবারই ফেরত (restocked=1 দিয়ে ডাবল-ফেরত আটকানো)। sellerId দিলে শুধু ওই Seller-এর লাইন।
export async function restockCancelled(env, orderId, sellerId) {
  try {
    let sql = "SELECT id, product_id, qty FROM order_items WHERE order_id = ? AND status IN ('cancelled','returned') AND restocked = 0";
    const b = [orderId];
    if (sellerId) { sql += ' AND seller_id = ?'; b.push(sellerId); }
    const rows = (await env.DB.prepare(sql).bind(...b).all()).results || [];
    for (const r of rows) {
      const mark = await env.DB.prepare('UPDATE order_items SET restocked = 1 WHERE id = ? AND restocked = 0').bind(r.id).run();
      if (!mark.meta || !mark.meta.changes || !r.product_id) continue;
      const up = await env.DB.prepare('UPDATE products SET stock = stock + ? WHERE id = ? AND stock IS NOT NULL').bind(r.qty, r.product_id).run();
      if (up.meta && up.meta.changes) {
        await env.DB.prepare('INSERT INTO stock_history (product_id, change, reason) VALUES (?, ?, ?)').bind(r.product_id, r.qty, 'অর্ডার বাতিল/রিটার্ন — স্টক ফেরত').run();
      }
    }
  } catch (e) { console.error('restock failed:', e && e.message); }
}
