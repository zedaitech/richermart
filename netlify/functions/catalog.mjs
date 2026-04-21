import { requireDb, json, errorResponse } from './_db.mjs';

// Public read-only catalog endpoint.
// Returns the shape the storefront consumes (mirrors menu.json's structure).
// GET /api/catalog  or  /.netlify/functions/catalog

export async function handler(event) {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });
  try {
    const sql = requireDb();
    const [storeRows, cats, items] = await Promise.all([
      sql`SELECT * FROM store WHERE id = 1 LIMIT 1`,
      sql`SELECT * FROM categories WHERE is_active = TRUE ORDER BY sort ASC, id ASC`,
      sql`SELECT * FROM items WHERE is_active = TRUE ORDER BY sort ASC, id ASC`,
    ]);

    const store = storeRows[0] || {};
    const categories = cats.map(c => ({
      name: c.name,
      section: c.section,
      sort: c.sort,
      items: items
        .filter(i => i.category_id === c.id)
        .map(serializeItem),
    }));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        // Short edge-cache so the public site loads quickly; admin edits become visible within 30s.
        'Cache-Control': 'public, max-age=15, s-maxage=30, stale-while-revalidate=60',
      },
      body: JSON.stringify({
        store: {
          name: store.name || '',
          tagline: store.tagline || '',
          phone: store.phone || '',
          logo: store.logo || '',
          google_maps_url: store.google_maps_url || '',
          status: store.status || 'Open',
          address: store.address || '',
          drug_license_no: store.drug_license_no || '',
          fssai_license_no: store.fssai_license_no || '',
          pharmacist_name: store.pharmacist_name || '',
          gstin: store.gstin || '',
          upi_id: store.upi_id || '',
          upi_merchant_name: store.upi_merchant_name || '',
          upi_qr_image: store.upi_qr_image || '',
        },
        categories,
      }),
    };
  } catch (err) {
    return errorResponse(err);
  }
}

function serializeItem(i) {
  return {
    name: i.name,
    description: i.description || '',
    price: i.price,
    image: i.image || '',
    section: i.section,
    is_featured: i.is_featured,
    in_stock: i.in_stock,
    unit: i.unit || null,
    weight_options: i.weight_options || null,
    is_organic: i.is_organic,
    origin: i.origin || '',
    is_seasonal: i.is_seasonal,
    brand: i.brand || '',
    dosage: i.dosage || '',
    form: i.form || '',
    pack_size: i.pack_size || '',
    requires_prescription: i.requires_prescription,
  };
}
