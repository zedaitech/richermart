// One-shot schema migration + data seed for Neon Postgres.
// Usage:
//   DATABASE_URL="postgres://user:pass@host/db?sslmode=require" node admin/seed.mjs
//
// The script is idempotent:
//   - Schema is created with IF NOT EXISTS guards (see ../migrations/001_init.sql).
//   - Data is only inserted when the items table is empty (pass --force to wipe & re-seed).

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// In Node.js we need to provide a WebSocket implementation for the Neon driver.
neonConfig.webSocketConstructor = ws;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const FORCE = process.argv.includes('--force');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('✗ DATABASE_URL is required.');
  console.error('  Example: DATABASE_URL="postgres://user:pass@ep-xyz.neon.tech/neondb?sslmode=require" node admin/seed.mjs');
  process.exit(1);
}

const pool = new Pool({ connectionString: url });

async function q(text, params = []) {
  const res = await pool.query(text, params);
  return res.rows;
}

async function runMigration() {
  const file = resolve(ROOT, 'migrations', '001_init.sql');
  const raw = readFileSync(file, 'utf8');
  // Send the whole migration as one batch — the Pool driver accepts multi-statement SQL.
  await pool.query(raw);
  console.log('✓ Schema ensured');
}

async function seedFromMenuJson() {
  const menu = JSON.parse(readFileSync(resolve(ROOT, 'menu.json'), 'utf8'));

  const existing = await q(`SELECT COUNT(*)::int AS n FROM items`);
  if (existing[0].n > 0 && !FORCE) {
    console.log(`• items already has ${existing[0].n} rows. Use --force to wipe and re-seed.`);
    return;
  }

  if (FORCE) {
    await q(`DELETE FROM items`);
    await q(`DELETE FROM categories`);
    console.log('✓ Wiped items + categories');
  }

  // Store singleton
  const s = menu.store || {};
  await q(
    `UPDATE store SET
       name = $1, tagline = $2, phone = $3, logo = $4,
       google_maps_url = $5, status = $6,
       drug_license_no = $7, fssai_license_no = $8,
       pharmacist_name = $9, gstin = $10
     WHERE id = 1`,
    [
      str(s.name), str(s.tagline), str(s.phone), str(s.logo),
      str(s.google_maps_url), str(s.status, 'Open'),
      str(s.drug_license_no), str(s.fssai_license_no),
      str(s.pharmacist_name), str(s.gstin),
    ],
  );
  console.log(`✓ Seeded store: ${s.name}`);

  for (const cat of menu.categories || []) {
    const [catRow] = await q(
      `INSERT INTO categories (name, section, sort, is_active)
       VALUES ($1, $2, $3, TRUE)
       RETURNING id`,
      [cat.name, cat.section, int(cat.sort, 0)],
    );
    let itemSort = 1;
    for (const it of cat.items || []) {
      await q(
        `INSERT INTO items (
           category_id, section, name, description, price, image, sort, is_active, is_featured, in_stock,
           unit, weight_options, is_organic, origin, is_seasonal,
           brand, dosage, form, pack_size, requires_prescription
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, TRUE, $8, $9,
           $10, $11, $12, $13, $14,
           $15, $16, $17, $18, $19
         )`,
        [
          catRow.id, it.section || cat.section,
          str(it.name), str(it.description), int(it.price, 0), str(it.image),
          itemSort++, bool(it.is_featured, false), bool(it.in_stock, true),
          it.unit || null,
          it.weight_options ? JSON.stringify(it.weight_options) : null,
          bool(it.is_organic, false), str(it.origin), bool(it.is_seasonal, false),
          str(it.brand), str(it.dosage), it.form || null, str(it.pack_size),
          bool(it.requires_prescription, false),
        ],
      );
    }
    console.log(`  ✓ ${cat.name} (${cat.section}): ${cat.items.length} items`);
  }
}

function str(v, def = '') { return typeof v === 'string' ? v : def; }
function int(v, def) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : def; }
function bool(v, def) { return typeof v === 'boolean' ? v : def; }

(async () => {
  try {
    console.log(`→ Connecting to Neon...`);
    await runMigration();
    await seedFromMenuJson();
    await pool.end();
    console.log('\nDone. Open /admin/ on your deployed site to start editing.');
  } catch (err) {
    console.error('\n✗ Seed failed:', err.message);
    if (err.stack) console.error(err.stack);
    try { await pool.end(); } catch {}
    process.exit(1);
  }
})();
