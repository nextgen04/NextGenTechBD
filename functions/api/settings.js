// GET /api/settings — পাবলিক এন্ডপয়েন্ট, দোকানের যোগাযোগ ও পেমেন্ট তথ্য ফেরত দেয়
import { json, err, toBool } from '../_lib/utils.js';

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const row = await env.DB.prepare(
      'SELECT phone, whatsapp, telegram, facebook, email, bkash, nagad, rocket, cod FROM settings WHERE id = 1'
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
    });
  } catch (e) {
    return err('সেটিংস লোড করা যায়নি: ' + e.message, 500);
  }
}
