import { requireDb, json, errorResponse, readJsonBody } from './_db.mjs';
import { requireAuth } from './_auth.mjs';

// GET    /api/admin/categories           → list
// POST   /api/admin/categories    { ... } → create
// PUT    /api/admin/categories/:id { ... } → update
// DELETE /api/admin/categories/:id

export async function handler(event) {
  try {
    requireAuth(event);
    const sql = requireDb();
    const id = intOrNull(event.queryStringParameters && event.queryStringParameters.id);

    if (event.httpMethod === 'GET') {
      const rows = await sql`SELECT * FROM categories ORDER BY sort ASC, id ASC`;
      return json(200, rows);
    }

    if (event.httpMethod === 'POST') {
      const b = await readJsonBody(event);
      assertCategory(b);
      const rows = await sql`
        INSERT INTO categories (name, section, sort, is_active)
        VALUES (${b.name}, ${b.section}, ${int(b.sort, 0)}, ${bool(b.is_active, true)})
        RETURNING *`;
      return json(201, rows[0]);
    }

    if (event.httpMethod === 'PUT' || event.httpMethod === 'PATCH') {
      if (!id) return json(400, { error: 'Missing id' });
      const b = await readJsonBody(event);
      assertCategory(b);
      const rows = await sql`
        UPDATE categories SET
          name = ${b.name},
          section = ${b.section},
          sort = ${int(b.sort, 0)},
          is_active = ${bool(b.is_active, true)}
        WHERE id = ${id}
        RETURNING *`;
      if (!rows[0]) return json(404, { error: 'Not found' });
      return json(200, rows[0]);
    }

    if (event.httpMethod === 'DELETE') {
      if (!id) return json(400, { error: 'Missing id' });
      const rows = await sql`DELETE FROM categories WHERE id = ${id} RETURNING id`;
      if (!rows[0]) return json(404, { error: 'Not found' });
      return json(200, { deleted: rows[0].id });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    return errorResponse(err);
  }
}

function assertCategory(b) {
  if (!b || typeof b.name !== 'string' || !b.name.trim()) throw http(400, 'name is required');
  if (!['fruits', 'medicines'].includes(b.section)) throw http(400, "section must be 'fruits' or 'medicines'");
}

function intOrNull(v) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; }
function int(v, def) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : def; }
function bool(v, def) { return typeof v === 'boolean' ? v : def; }
function http(status, message) { const e = new Error(message); e.statusCode = status; return e; }
