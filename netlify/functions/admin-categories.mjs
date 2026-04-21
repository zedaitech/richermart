import { requireDb } from './_db.mjs';
import { verifyToken } from './_auth.mjs';

// GET    /api/admin/categories           → list
// POST   /api/admin/categories    { ... } → create
// PUT    /api/admin/categories/:id { ... } → update
// DELETE /api/admin/categories/:id
//
// v2 Function with native path-parameter routing.

export default async (req, context) => {
  try {
    const auth = req.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!verifyToken(token)) return jsonRes(401, { error: 'Unauthorized' });

    const sql = requireDb();
    const id = intOrNull(context?.params?.id);

    if (req.method === 'GET') {
      const rows = await sql`SELECT * FROM categories ORDER BY sort ASC, id ASC`;
      return jsonRes(200, rows);
    }

    if (req.method === 'POST') {
      const b = await req.json();
      assertCategory(b);
      const rows = await sql`
        INSERT INTO categories (name, section, sort, is_active)
        VALUES (${b.name}, ${b.section}, ${int(b.sort, 0)}, ${bool(b.is_active, true)})
        RETURNING *`;
      return jsonRes(201, rows[0]);
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      if (!id) return jsonRes(400, { error: 'Missing id' });
      const b = await req.json();
      assertCategory(b);
      const rows = await sql`
        UPDATE categories SET
          name = ${b.name},
          section = ${b.section},
          sort = ${int(b.sort, 0)},
          is_active = ${bool(b.is_active, true)}
        WHERE id = ${id}
        RETURNING *`;
      if (!rows[0]) return jsonRes(404, { error: 'Not found' });
      return jsonRes(200, rows[0]);
    }

    if (req.method === 'DELETE') {
      if (!id) return jsonRes(400, { error: 'Missing id' });
      const rows = await sql`DELETE FROM categories WHERE id = ${id} RETURNING id`;
      if (!rows[0]) return jsonRes(404, { error: 'Not found' });
      return jsonRes(200, { deleted: rows[0].id });
    }

    return jsonRes(405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('admin-categories error:', err);
    return jsonRes(err.statusCode || 500, { error: err.message || 'Internal error' });
  }
};

export const config = {
  path: ['/api/admin/categories', '/api/admin/categories/:id'],
};

function assertCategory(b) {
  if (!b || typeof b.name !== 'string' || !b.name.trim()) throw http(400, 'name is required');
  if (!['fruits', 'medicines'].includes(b.section)) throw http(400, "section must be 'fruits' or 'medicines'");
}

function jsonRes(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function intOrNull(v) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; }
function int(v, def) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : def; }
function bool(v, def) { return typeof v === 'boolean' ? v : def; }
function http(status, message) { const e = new Error(message); e.statusCode = status; return e; }
