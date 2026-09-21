// /api/admin/settings — অ্যাডমিন প্যানেল থেকে দোকানের সব সেটিংস বদলানো (X-Admin-Key হেডার লাগবে)
// GET → বর্তমান সেটিংস
// PUT → সেটিংস আপডেট
import { json, err, requireAdmin, toBool } from '../../_lib/utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  try {
    const row = await env.DB.prepare(
      `SELECT phone, whatsapp, telegram, facebook, email, bkash, nagad, rocket, cod,
              shop_name, address, currency, invoice_prefix,
              delivery_charge_dhaka, delivery_charge_outside, free_delivery_threshold,
              courier_services, maintenance_mode
       FROM settings WHERE id = 1`
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
    const s = b.shop || {};
    const d = b.delivery || {};

    await env.DB.prepare(
      `INSERT INTO settings (
         id, phone, whatsapp, telegram, facebook, email, bkash, nagad, rocket, cod,
         shop_name, address, currency, invoice_prefix,
         delivery_charge_dhaka, delivery_charge_outside, free_delivery_threshold,
         courier_services, maintenance_mode
       )
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         phone=excluded.phone, whatsapp=excluded.whatsapp, telegram=excluded.telegram,
         facebook=excluded.facebook, email=excluded.email, bkash=excluded.bkash,
         nagad=excluded.nagad, rocket=excluded.rocket, cod=excluded.cod,
         shop_name=excluded.shop_name, address=excluded.address, currency=excluded.currency,
         invoice_prefix=excluded.invoice_prefix,
         delivery_charge_dhaka=excluded.delivery_charge_dhaka,
         delivery_charge_outside=excluded.delivery_charge_outside,
         free_delivery_threshold=excluded.free_delivery_threshold,
         courier_services=excluded.courier_services,
         maintenance_mode=excluded.maintenance_mode`
    )
      .bind(
        c.phone || null, c.whatsapp || null, c.telegram || null, c.facebook || null, c.email || null,
        p.bkash || null, p.nagad || null, p.rocket || null, toBool(p.cod) ? 1 : 0,
        s.name || 'NextGenTechBD', s.address || null, s.currency || '৳', s.invoice_prefix || 'INV',
        d.dhaka !== undefined ? Number(d.dhaka) : 60,
        d.outside !== undefined ? Number(d.outside) : 120,
        d.free_threshold !== undefined ? Number(d.free_threshold) : 1999,
        Array.isArray(d.couriers) ? d.couriers.join(', ') : (d.couriers || null),
        toBool(b.maintenance_mode) ? 1 : 0
      )
      .run();
    return json({ ok: true });
  } catch (e) {
    return err('সেটিংস সংরক্ষণ করা যায়নি: ' + e.message, 500);
  }
}
