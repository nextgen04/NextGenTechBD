// /api/admin/site-text — অ্যাডমিন প্যানেল থেকে হোমপেজের সেকশন-শিরোনাম বদলানো (X-Admin-Key হেডার লাগবে)
// GET → বর্তমান সব টেক্সট (key-value)
// PUT → { flash_sale_title, categories_title, just_for_you_title, ... } দিয়ে একসাথে আপডেট
import { json, err, requireAdmin } from '../../_lib/utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  try {
    const res = await env.DB.prepare('SELECT key, value FROM site_text').all();
    const out = {};
    (res.results || []).forEach((row) => { out[row.key] = row.value; });
    return json(out);
  } catch (e) {
    return err('টেক্সট লোড করা যায়নি: ' + e.message, 500);
  }
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  try {
    const body = await request.json();
    const entries = Object.entries(body || {}).filter(([k, v]) => typeof k === 'string' && typeof v === 'string');
    if (!entries.length) return err('কোনো টেক্সট দেওয়া হয়নি', 400);

    const stmts = entries.map(([k, v]) =>
      env.DB.prepare(
        `INSERT INTO site_text (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
      ).bind(k, v)
    );
    await env.DB.batch(stmts);

    return json({ ok: true });
  } catch (e) {
    return err('টেক্সট সংরক্ষণ করা যায়নি: ' + e.message, 500);
  }
}
