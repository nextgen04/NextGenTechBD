// D1 এর মতো API (prepare/bind/first/all/run/batch) — node:sqlite এর ওপর; শুধু লোকাল টেস্টের জন্য
import { DatabaseSync } from 'node:sqlite';
export function makeDB(file = ':memory:') {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  const wrap = (sql, args = []) => ({
    bind: (...a) => wrap(sql, a),
    async first() { const r = db.prepare(sql).get(...args); return r === undefined ? null : { ...r }; },
    async all() { const r = db.prepare(sql).all(...args); return { results: r.map((x) => ({ ...x })), success: true }; },
    async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
    _sql: sql, _args: args,
  });
  return {
    raw: db,
    prepare: (sql) => wrap(sql),
    async batch(stmts) {
      db.exec('BEGIN');
      try { const out = []; for (const s of stmts) out.push(await s.run()); db.exec('COMMIT'); return out; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    exec: (s) => db.exec(s),
  };
}
