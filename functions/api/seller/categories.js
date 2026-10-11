// GET /api/seller/categories — সেলার শুধু বিদ্যমান ক্যাটাগরি থেকে বাছাই করতে পারে (নতুন তৈরি করা যায় না — শুধু Super Admin)
import { json } from '../../_lib/utils.js';
import { requireSeller } from '../../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const auth = await requireSeller(request, env, { permission: 'products:read' });
  if (auth.response) return auth.response;
  const res = await env.DB.prepare('SELECT id, name, name_en, e FROM categories ORDER BY sort_order ASC, rowid ASC').all();
  return json({ categories: res.results || [] });
}
