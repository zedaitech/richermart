import { requireDb, json, errorResponse, readJsonBody } from './_db.mjs';
import { requireAuth } from './_auth.mjs';

// GET  /api/admin/store           → current singleton
// PUT  /api/admin/store  { ... }  → update

export async function handler(event) {
  try {
    const sql = requireDb();

    if (event.httpMethod === 'GET') {
      requireAuth(event);
      const rows = await sql`SELECT * FROM store WHERE id = 1`;
      return json(200, rows[0] || {});
    }

    if (event.httpMethod === 'PUT' || event.httpMethod === 'PATCH') {
      requireAuth(event);
      const b = await readJsonBody(event);
      const rows = await sql`
        UPDATE store SET
          name = ${s(b.name)},
          tagline = ${s(b.tagline)},
          phone = ${s(b.phone)},
          logo = ${s(b.logo)},
          google_maps_url = ${s(b.google_maps_url)},
          status = ${s(b.status, 'Open')},
          drug_license_no = ${s(b.drug_license_no)},
          fssai_license_no = ${s(b.fssai_license_no)},
          pharmacist_name = ${s(b.pharmacist_name)},
          gstin = ${s(b.gstin)}
        WHERE id = 1
        RETURNING *`;
      return json(200, rows[0]);
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    return errorResponse(err);
  }
}

function s(v, def = '') { return typeof v === 'string' ? v : def; }
