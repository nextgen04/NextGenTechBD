// অর্ডার-আইটেমের অবস্থা (seller_status) ↔ গ্রাহকের দেখা মূল অর্ডারের অবস্থা (orders.status) সিঙ্ক,
// এবং বাতিল/পুনরায় চালুর সময় স্টক ফেরত/কাটা।
export const FINAL_STATUSES = ['cancelled', 'returned'];

// একাধিক সেলারের আইটেম থেকে গ্রাহকের জন্য একটিমাত্র অবস্থা:
//  সব এক হলে সেটাই; বাতিল/ফেরত বাদে বাকি সব delivered হলে delivered; কোনোটা shipped/delivered হলে shipped;
//  নইলে confirmed → processing → pending।
export function deriveOrderStatus(statuses) {
  if (!statuses.length) return null;
  if (new Set(statuses).size === 1) return statuses[0];
  const active = statuses.filter((s) => !FINAL_STATUSES.includes(s));
  if (!active.length) return statuses.includes('returned') ? 'returned' : 'cancelled';
  if (active.every((s) => s === 'delivered')) return 'delivered';
  if (active.some((s) => s === 'shipped' || s === 'delivered')) return 'shipped';
  if (active.includes('confirmed')) return 'confirmed';
  if (active.includes('processing')) return 'processing';
  return 'pending';
}

export async function syncOrderStatus(env, orderId, by = 'system') {
  const rows = await env.DB.prepare('SELECT seller_status FROM order_items WHERE order_id = ?').bind(orderId).all();
  const next = deriveOrderStatus((rows.results || []).map((r) => r.seller_status));
  if (!next) return null;
  const cur = await env.DB.prepare('SELECT status FROM orders WHERE id = ?').bind(orderId).first();
  if (!cur || cur.status === next) return next;
  await env.DB.batch([
    env.DB.prepare('UPDATE orders SET status = ? WHERE id = ?').bind(next, orderId),
    env.DB.prepare('INSERT INTO order_status_history (order_id, status, note) VALUES (?, ?, ?)').bind(orderId, next, `আইটেমের অবস্থা অনুযায়ী (${by})`),
  ]);
  return next;
}

// আইটেমের স্ট্যাটাস বদলের পার্শ্ব-প্রভাব: ইতিহাস + (বাতিলে) স্টক ফেরত / (বাতিল থেকে ফিরলে) স্টক আবার কাটা।
// it = { id, product_id, quantity, seller_id, from }। কলার নিজে order_items UPDATE করবে।
export async function itemStatusSideEffects(env, it, to, by, note = null) {
  const stmts = [
    env.DB.prepare('INSERT INTO order_item_status_history (order_item_id, status, note, changed_by) VALUES (?, ?, ?, ?)').bind(it.id, to, note, by),
  ];
  const from = it.from;
  if (it.product_id) {
    const p = await env.DB.prepare('SELECT stock FROM products WHERE id = ?').bind(it.product_id).first();
    if (p && p.stock !== null && p.stock !== undefined) {
      const hist = (change, reason) => env.DB.prepare('INSERT INTO stock_history (product_id, change, reason, seller_id, changed_by) VALUES (?, ?, ?, ?, ?)').bind(it.product_id, change, reason, it.seller_id, by);
      if (to === 'cancelled' && !FINAL_STATUSES.includes(from)) {
        stmts.push(env.DB.prepare('UPDATE products SET stock = stock + ? WHERE id = ? AND stock IS NOT NULL').bind(it.quantity, it.product_id), hist(it.quantity, 'অর্ডার বাতিল — স্টক ফেরত'));
      } else if (from === 'cancelled' && to !== 'cancelled') {
        stmts.push(env.DB.prepare('UPDATE products SET stock = MAX(stock - ?, 0) WHERE id = ? AND stock IS NOT NULL').bind(it.quantity, it.product_id), hist(-it.quantity, 'বাতিল অর্ডার পুনরায় চালু — স্টক কাটা'));
      }
    }
  }
  return stmts;
}

// Super Admin override: কোনো ট্রানজিশন-নিয়ম ছাড়াই আইটেম(গুলো)র অবস্থা বদলায়, তারপর মূল অর্ডারের অবস্থা সিঙ্ক করে।
export async function adminSetItemsStatus(env, items, to, note = null) {
  const stmts = []; let changed = 0;
  for (const it of items) {
    if (it.seller_status === to) continue;
    if (it.seller_status === 'cancelled' && to === 'returned') continue;   // বাতিল পণ্য কখনো ডেলিভারি হয়নি — "ফেরত" অবৈধ (স্টক হিসাব বিগড়ে যেত)
    stmts.push(env.DB.prepare(`UPDATE order_items SET seller_status = ?, updated_at = datetime('now') WHERE id = ?`).bind(to, it.id));
    stmts.push(...(await itemStatusSideEffects(env, { id: it.id, product_id: it.product_id, quantity: it.quantity, seller_id: it.seller_id, from: it.seller_status }, to, 'super_admin', note)));
    changed++;
  }
  if (stmts.length) await env.DB.batch(stmts);
  return changed;
}
