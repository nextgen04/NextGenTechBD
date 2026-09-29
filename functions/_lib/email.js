// ইমেইল পাঠানোর হেল্পার — Cloudflare Pages Functions থেকে HTTP API দিয়ে পাঠায় (কোনো প্যাকেজ লাগে না)
// সাপোর্টেড সার্ভিস (যেটার API কী সেট থাকবে সেটা ব্যবহার হবে):
//   ১) Brevo  → BREVO_API_KEY   (ফ্রি ৩০০/দিন, নিজের ডোমেইন ছাড়াই শুধু একটা sender ইমেইল ভেরিফাই করলেই চলে)
//   ২) Resend → RESEND_API_KEY  (ফ্রি ১০০/দিন, তবে অন্য মানুষকে পাঠাতে নিজের ডোমেইন ভেরিফাই করতে হয়)
// দুটোর জন্যই দরকার: EMAIL_FROM (প্রেরকের ইমেইল), ঐচ্ছিক EMAIL_FROM_NAME (ডিফল্ট: NextGenTechBD)
import { escapeHtml } from './utils.js';

export async function sendEmail(env, { to, subject, html, text }) {
  const fromAddr = env.EMAIL_FROM;
  const fromName = env.EMAIL_FROM_NAME || 'NextGenTechBD';
  if (!fromAddr) throw new Error('EMAIL_FROM সেট করা নেই');

  let res;
  if (env.BREVO_API_KEY) {
    res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: fromName, email: fromAddr },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
    });
  } else if (env.RESEND_API_KEY) {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${fromName} <${fromAddr}>`, to: [to], subject, html, text }),
    });
  } else {
    throw new Error('ইমেইল সার্ভিস কনফিগার করা নেই (BREVO_API_KEY অথবা RESEND_API_KEY লাগবে)');
  }

  if (!res.ok) {
    // এরর বডি লগ করা হচ্ছে না — কিছু সার্ভিস এরর মেসেজে API কী-এর অংশ দেখায়
    throw new Error('ইমেইল পাঠানো ব্যর্থ, HTTP ' + res.status);
  }
}

/* ============ ইমেইল টেমপ্লেট ============ */

function layout(title, bodyHtml) {
  return `<!doctype html><html lang="bn"><body style="margin:0;background:#f4f4f4;padding:24px;font-family:Arial,'Noto Sans Bengali',sans-serif;color:#222">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
<h2 style="margin:0 0 14px;color:#e04a04;font-size:20px">${escapeHtml(title)}</h2>
${bodyHtml}
<hr style="border:none;border-top:1px solid #eee;margin:22px 0 12px">
<p style="font-size:12px;color:#999;margin:0">NextGenTechBD — এই ইমেইলটি স্বয়ংক্রিয়ভাবে পাঠানো হয়েছে, এর উত্তর দেওয়ার দরকার নেই।</p>
</div></body></html>`;
}

function button(link, label) {
  return `<p style="margin:22px 0"><a href="${escapeHtml(link)}" style="background:#F85606;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;display:inline-block">${escapeHtml(label)}</a></p>
<p style="font-size:12px;color:#777;word-break:break-all">বাটন কাজ না করলে এই লিংকটি ব্রাউজারে পেস্ট করুন:<br>${escapeHtml(link)}</p>`;
}

// কাস্টমারের পাসওয়ার্ড রিসেট ইমেইল
export function customerResetEmail({ name, link, minutes }) {
  const subject = 'পাসওয়ার্ড রিসেট করুন — NextGenTechBD';
  const html = layout('পাসওয়ার্ড রিসেট', `
<p>হ্যালো ${escapeHtml(name || 'গ্রাহক')},</p>
<p>আপনার অ্যাকাউন্টের পাসওয়ার্ড রিসেটের অনুরোধ পাওয়া গেছে। নতুন পাসওয়ার্ড সেট করতে নিচের বাটনে ক্লিক করুন। লিংকটি <b>${minutes} মিনিট</b> পর্যন্ত কাজ করবে এবং একবারই ব্যবহার করা যাবে।</p>
${button(link, 'নতুন পাসওয়ার্ড সেট করুন')}
<p style="font-size:13px;color:#555">আপনি এই অনুরোধ না করে থাকলে ইমেইলটি উপেক্ষা করুন — আপনার পাসওয়ার্ড অপরিবর্তিত থাকবে।</p>`);
  const text = `হ্যালো ${name || 'গ্রাহক'},\n\nপাসওয়ার্ড রিসেট করতে এই লিংকে যান (${minutes} মিনিট পর্যন্ত কার্যকর, একবার ব্যবহারযোগ্য):\n${link}\n\nআপনি অনুরোধ না করে থাকলে এই ইমেইল উপেক্ষা করুন।`;
  return { subject, html, text };
}

// অ্যাডমিনের পাসওয়ার্ড রিসেট ইমেইল
export function adminResetEmail({ link, minutes, ip, userAgent }) {
  const subject = '🔐 অ্যাডমিন পাসওয়ার্ড রিসেট — NextGenTechBD';
  const html = layout('অ্যাডমিন পাসওয়ার্ড রিসেট', `
<p>অ্যাডমিন প্যানেলের পাসওয়ার্ড রিসেটের অনুরোধ পাওয়া গেছে। নতুন পাসওয়ার্ড সেট করতে নিচের বাটনে ক্লিক করুন। লিংকটি <b>${minutes} মিনিট</b> পর্যন্ত কাজ করবে এবং একবারই ব্যবহার করা যাবে।</p>
${button(link, 'নতুন অ্যাডমিন পাসওয়ার্ড সেট করুন')}
<p style="font-size:12.5px;color:#555">অনুরোধটি এসেছে — IP: <b>${escapeHtml(ip || 'অজানা')}</b><br>ডিভাইস: ${escapeHtml((userAgent || 'অজানা').slice(0, 120))}</p>
<p style="font-size:13px;color:#c22"><b>আপনি এই অনুরোধ না করে থাকলে</b> ইমেইলটি উপেক্ষা করুন এবং কেউ আপনার সিস্টেমে ঢোকার চেষ্টা করছে কিনা অ্যাডমিন প্যানেলের "সিকিউরিটি" ট্যাবে লগ দেখে নিন।</p>`);
  const text = `অ্যাডমিন পাসওয়ার্ড রিসেট করতে এই লিংকে যান (${minutes} মিনিট পর্যন্ত কার্যকর, একবার ব্যবহারযোগ্য):\n${link}\n\nঅনুরোধের IP: ${ip || 'অজানা'}\nআপনি অনুরোধ না করে থাকলে এই ইমেইল উপেক্ষা করুন।`;
  return { subject, html, text };
}

// পাসওয়ার্ড বদলানোর পর নিশ্চিতকরণ ইমেইল (কেউ অনুমতি ছাড়া বদলালে যেন সাথে সাথে জানা যায়)
export function passwordChangedEmail({ name, isAdmin }) {
  const who = isAdmin ? 'অ্যাডমিন' : 'আপনার অ্যাকাউন্টের';
  const subject = 'পাসওয়ার্ড বদলানো হয়েছে — NextGenTechBD';
  const html = layout('পাসওয়ার্ড বদলানো হয়েছে', `
<p>${name ? 'হ্যালো ' + escapeHtml(name) + ',' : ''}</p>
<p>${who} পাসওয়ার্ড এইমাত্র সফলভাবে বদলানো হয়েছে এবং আগের সব লগইন সেশন বন্ধ করে দেওয়া হয়েছে।</p>
<p style="font-size:13px;color:#c22"><b>এটা আপনি না করে থাকলে</b> এখনই আবার "পাসওয়ার্ড ভুলে গেছেন?" থেকে পাসওয়ার্ড রিসেট করুন এবং দোকানের সাথে যোগাযোগ করুন।</p>`);
  const text = `${who} পাসওয়ার্ড এইমাত্র বদলানো হয়েছে এবং আগের সব লগইন সেশন বন্ধ করা হয়েছে। এটা আপনি না করে থাকলে এখনই আবার পাসওয়ার্ড রিসেট করুন।`;
  return { subject, html, text };
}
