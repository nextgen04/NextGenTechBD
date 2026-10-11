// GET /api/settings — পাবলিক এন্ডপয়েন্ট, দোকানের সব পাবলিক তথ্য ফেরত দেয়
import { json, err, toBool } from '../_lib/utils.js';

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const row = await env.DB.prepare(
      `SELECT phone, whatsapp, telegram, facebook, email, bkash, nagad, rocket, cod,
              shop_name, address, currency, invoice_prefix,
              delivery_charge_dhaka, delivery_charge_outside, free_delivery_threshold,
              courier_services, maintenance_mode
       FROM settings WHERE id = 1`
    ).first();

    if (!row) return json({});

    return json({
      contact: {
        phone: row.phone,
        whatsapp: row.whatsapp,
        telegram: row.telegram,
        facebook: row.facebook,
        email: row.email,
      },
      payment: {
        bkash: row.bkash,
        nagad: row.nagad,
        rocket: row.rocket,
        cod: toBool(row.cod),
      },
      shop: {
        name: row.shop_name || 'NextGenTechBD',
        address: row.address,
        currency: row.currency || '৳',
        invoice_prefix: row.invoice_prefix || 'INV',
      },
      delivery: {
        dhaka: row.delivery_charge_dhaka ?? 60,
        outside: row.delivery_charge_outside ?? 120,
        free_threshold: row.free_delivery_threshold ?? 1999,
        couriers: row.courier_services ? row.courier_services.split(',').map((s) => s.trim()).filter(Boolean) : [],
      },
      maintenance_mode: toBool(row.maintenance_mode),
    });
  } catch (e) {
    return err('সেটিংস লোড করা যায়নি: ' + e.message, 500);
  }
}
