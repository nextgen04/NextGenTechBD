// GET /api/customer/me — বর্তমান লগইন করা গ্রাহকের তথ্য (সেশন টোকেন দিয়ে যাচাই)
import { json, err, getCustomerFromRequest } from '../../_lib/utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const customer = await getCustomerFromRequest(request, env);
  if (!customer) return err('লগইন করা প্রয়োজন', 401);
  return json({ customer });
}
