import { requireDb, json, errorResponse, readJsonBody } from './_db.mjs';
import { requireAuth } from './_auth.mjs';

// GET    /api/admin/items              → list with category info
// POST   /api/admin/items     { ... }   → create
// PUT    /api/admin/items/:id { ... }   → update
// DELETE /api/admin/items/:id

const FORMS = new Set(['tablet', 'capsule', 'syrup', 'cream', 'ointment', 'drops', 'injection']);
const UNITS = new Set(['per_kg', 'per_dozen', 'per_piece']);

export async function handler(event) {
  try {
    requireAuth(event);
    const sql = requireDb();
    const id = intOrNull(event.queryStringParameters && event.queryStringParameters.id);

    if (event.httpMethod === 'GET') {
      const rows = await sql`
        SELECT i.*, c.name AS category_name, c.section AS category_section
        FROM items i
        JOIN categories c ON c.id = i.category_id
        ORDER BY i.section ASC, c.sort ASC, i.sort ASC, i.id ASC`;
      return json(200, rows);
    }

    if (event.httpMethod === 'POST') {
      const b = await readJsonBody(event);
      const v = assertItem(b, sql);
      const p = await v;
      const rows = await sql`
        INSERT INTO items (
          category_id, section, name, description, price, image, sort, is_active, is_featured, in_stock,
          unit, weight_options, is_organic, origin, is_seasonal,
          brand, dosage, form, pack_size, requires_prescription
        ) VALUES (
          ${p.category_id}, ${p.section}, ${p.name}, ${p.description}, ${p.price}, ${p.image},
          ${p.sort}, ${p.is_active}, ${p.is_featured}, ${p.in_stock},
          ${p.unit}, ${p.weight_options}, ${p.is_organic}, ${p.origin}, ${p.is_seasonal},
          ${p.brand}, ${p.dosage}, ${p.form}, ${p.pack_size}, ${p.requires_prescription}
        )
        RETURNING *`;
      return json(201, rows[0]);
    }

    if (event.httpMethod === 'PUT' || event.httpMethod === 'PATCH') {
      if (!id) return json(400, { error: 'Missing id' });
      const b = await readJsonBody(event);
      const p = await assertItem(b, sql);
      const rows = await sql`
        UPDATE items SET
          category_id = ${p.category_id},
          section = ${p.section},
          name = ${p.name},
          description = ${p.description},
          price = ${p.price},
          image = ${p.image},
          sort = ${p.sort},
          is_active = ${p.is_active},
          is_featured = ${p.is_featured},
          in_stock = ${p.in_stock},
          unit = ${p.unit},
          weight_options = ${p.weight_options},
          is_organic = ${p.is_organic},
          origin = ${p.origin},
          is_seasonal = ${p.is_seasonal},
          brand = ${p.brand},
          dosage = ${p.dosage},
          form = ${p.form},
          pack_size = ${p.pack_size},
          requires_prescription = ${p.requires_prescription},
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *`;
      if (!rows[0]) return json(404, { error: 'Not found' });
      return json(200, rows[0]);
    }

    if (event.httpMethod === 'DELETE') {
      if (!id) return json(400, { error: 'Missing id' });
      const rows = await sql`DELETE FROM items WHERE id = ${id} RETURNING id`;
      if (!rows[0]) return json(404, { error: 'Not found' });
      return json(200, { deleted: rows[0].id });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    return errorResponse(err);
  }
}

async function assertItem(b, sql) {
  if (!b || typeof b.name !== 'string' || !b.name.trim()) throw http(400, 'name is required');
  const categoryId = intOrNull(b.category_id);
  if (!categoryId) throw http(400, 'category_id is required');
  const cat = (await sql`SELECT id, section FROM categories WHERE id = ${categoryId}`)[0];
  if (!cat) throw http(400, 'category not found');

  const section = cat.section;
  const price = intOrNull(b.price);
  if (price === null || price < 0) throw http(400, 'price must be a non-negative integer (in rupees)');

  const form = b.form == null || b.form === '' ? null : String(b.form).toLowerCase();
  if (form && !FORMS.has(form)) throw http(400, `form must be one of ${[...FORMS].join(', ')}`);

  const unit = b.unit == null || b.unit === '' ? null : String(b.unit);
  if (unit && !UNITS.has(unit)) throw http(400, `unit must be one of ${[...UNITS].join(', ')}`);

  let weightOptions = null;
  if (section === 'fruits' && b.weight_options != null && b.weight_options !== '') {
    const parsed = typeof b.weight_options === 'string' ? safeJson(b.weight_options) : b.weight_options;
    if (!Array.isArray(parsed)) throw http(400, 'weight_options must be an array of {label, grams, price}');
    parsed.forEach((o, idx) => {
      if (!o || typeof o.label !== 'string') throw http(400, `weight_options[${idx}].label required`);
      if (!Number.isFinite(o.grams)) throw http(400, `weight_options[${idx}].grams must be a number`);
      if (!Number.isFinite(o.price)) throw http(400, `weight_options[${idx}].price must be a number`);
    });
    weightOptions = parsed;
  }

  return {
    category_id: categoryId,
    section,
    name: b.name.trim(),
    description: s(b.description),
    price,
    image: s(b.image),
    sort: int(b.sort, 0),
    is_active: bool(b.is_active, true),
    is_featured: bool(b.is_featured, false),
    in_stock: bool(b.in_stock, true),

    unit: section === 'fruits' ? unit : null,
    weight_options: section === 'fruits' ? weightOptions : null,
    is_organic: section === 'fruits' ? bool(b.is_organic, false) : false,
    origin: section === 'fruits' ? s(b.origin) : '',
    is_seasonal: section === 'fruits' ? bool(b.is_seasonal, false) : false,

    brand: section === 'medicines' ? s(b.brand) : '',
    dosage: section === 'medicines' ? s(b.dosage) : '',
    form: section === 'medicines' ? form : null,
    pack_size: section === 'medicines' ? s(b.pack_size) : '',
    requires_prescription: section === 'medicines' ? bool(b.requires_prescription, false) : false,
  };
}

function safeJson(x) { try { return JSON.parse(x); } catch { return null; } }
function s(v) { return typeof v === 'string' ? v : ''; }
function intOrNull(v) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; }
function int(v, def) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : def; }
function bool(v, def) { return typeof v === 'boolean' ? v : def; }
function http(status, message) { const e = new Error(message); e.statusCode = status; return e; }
