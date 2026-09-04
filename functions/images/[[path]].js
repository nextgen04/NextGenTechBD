// GET /images/* — R2 বাকেটে সংরক্ষিত পণ্যের ছবি সরাসরি সাইটের নিজস্ব ডোমেইন থেকে সার্ভ করে
// (R2-এর জন্য আলাদা পাবলিক ডোমেইন/সাবডোমেইন সেটআপ করা লাগে না — এটাই ছবির পাবলিক লিংক)
export async function onRequestGet(context) {
  const { env, params } = context;
  const key = Array.isArray(params.path) ? params.path.join('/') : params.path;
  if (!key) return new Response('Not found', { status: 404 });

  const obj = await env.IMAGES.get(key);
  if (!obj) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');

  return new Response(obj.body, { headers });
}
