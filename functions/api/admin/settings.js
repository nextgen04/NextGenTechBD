// /api/admin/settings — অ্যাডমিন প্যানেল থেকে যোগাযোগ ও পেমেন্ট তথ্য বদলানো (X-Admin-Key হেডার লাগবে)
// GET → বর্তমান সেটিংস
// PUT → সেটিংস আপডেট
import { json, err, requireAdmin, toBool } from '../../_lib/utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  try {
    const row = await env.DB.prepare(
      'SELECT phone, whatsapp, telegram, facebook, email, bkash, nagad, rocket, cod FROM settings WHERE id = 1'
    ).first();
    return json(row || {});
  } catch (e) {
    return err('সেটিংস লোড করা যায়নি: ' + e.message, 500);
  }
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  try {
    const b = await request.json();
    const c = b.contact || {};
    const p = b.payment || {};
    await env.DB.prepare(
      `INSERT INTO settings (id, phone, whatsapp, telegram, facebook, email, bkash, nagad, rocket, cod)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         phone=excluded.phone, whatsapp=excluded.whatsapp, telegram=excluded.telegram,
         facebook=excluded.facebook, email=excluded.email, bkash=excluded.bkash,
         nagad=excluded.nagad, rocket=excluded.rocket, cod=excluded.cod`
    )
      .bind(
        c.phone || null, c.whatsapp || null, c.telegram || null, c.facebook || null, c.email || null,
        p.bkash || null, p.nagad || null, p.rocket || null, toBool(p.cod) ? 1 : 0
      )
      .run();
    return json({ ok: true });
  } catch (e) {
    return err('সেটিংস সংরক্ষণ করা যায়নি: ' + e.message, 500);
  }
}
