// সহজ rate limiter (D1 ভিত্তিক, নির্দিষ্ট সময়-জানালায় গণনা)। কোনো বাইরের সার্ভিস/সেটআপ লাগে না।
// ব্যবহার:  const limited = await rateLimit(env, request, 'login', 15, 15 * 60);  if (limited) return limited;
// সীমা পার হলে 429 Response ফেরত দেয়, নাহলে null।
// টেবিল না থাকলে বা DB এরর হলে সাইট চালু রাখতে অনুরোধ আটকায় না (fail-open) — শুধু লগ করে।
import { err } from './utils.js';

export function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}

// perIp=false হলে কী-তে IP থাকে না (যেমন একটা ফোন নম্বরে সব IP মিলিয়ে মোট চেষ্টা গোনার জন্য)
export async function rateLimit(env, request, bucket, max, windowSec, extraKey = '', perIp = true) {
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const w = Math.floor(nowSec / windowSec);
    const key = `${bucket}${perIp ? ':' + clientIp(request) : ''}${extraKey ? ':' + extraKey : ''}`.slice(0, 200);
    const row = await env.DB.prepare(
      'INSERT INTO rate_limits (k, w, n, exp) VALUES (?, ?, 1, ?) ON CONFLICT(k, w) DO UPDATE SET n = n + 1 RETURNING n'
    ).bind(key, w, (w + 1) * windowSec).first();

    if (Math.random() < 0.02) { // মাঝে মাঝে পুরনো রো মুছে ফেলা
      await env.DB.prepare('DELETE FROM rate_limits WHERE exp < ?').bind(nowSec - 3600).run();
    }
    if (row && row.n > max) {
      const res = err('অনেক বেশি অনুরোধ হয়েছে — কিছুক্ষণ পর আবার চেষ্টা করুন', 429);
      res.headers.set('Retry-After', String(Math.max(1, (w + 1) * windowSec - nowSec)));
      return res;
    }
  } catch (e) {
    console.error('rateLimit failed (skipped):', e && e.message);
  }
  return null;
}
