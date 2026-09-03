// GET /api/products — পাবলিক এন্ডপয়েন্ট, দোকানের পণ্য ও ক্যাটাগরি ফেরত দেয়
import { json, err, parseListField } from '../_lib/utils.js';

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const catRes = await env.DB.prepare(
      'SELECT id, name, name_en, e, img FROM categories ORDER BY sort_order ASC, rowid ASC'
    ).all();

    const prodRes = await env.DB.prepare(
      'SELECT id, cat, name, name_en, price, old, e, img, r, rv, sold, tag, f, colors, sizes FROM products ORDER BY id ASC'
    ).all();

    const categories = (catRes.results || []).map((c) => {
      const o = { ...c };
      Object.keys(o).forEach((k) => o[k] === null && delete o[k]);
      return o;
    });

    const products = (prodRes.results || []).map((p) => {
      const o = { ...p };
      o.f = p.f ? 1 : undefined;
      const colors = parseListField(p.colors);
      const sizes = parseListField(p.sizes);
      delete o.colors;
      delete o.sizes;
      if (colors) o.colors = colors;
      if (sizes) o.sizes = sizes;
      Object.keys(o).forEach((k) => (o[k] === null || o[k] === undefined) && delete o[k]);
      return o;
    });

    return json({ categories, products });
  } catch (e) {
    return err('ডেটাবেজ থেকে পণ্য লোড করা যায়নি: ' + e.message, 500);
  }
}
