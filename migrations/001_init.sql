-- GreenLeaf Mart schema for Neon Postgres
-- Run once against a fresh Neon database. Safe to re-run (IF NOT EXISTS guards).

CREATE TABLE IF NOT EXISTS store (
  id                    SMALLINT PRIMARY KEY DEFAULT 1,
  name                  TEXT NOT NULL DEFAULT '',
  tagline               TEXT NOT NULL DEFAULT '',
  phone                 TEXT NOT NULL DEFAULT '',
  logo                  TEXT NOT NULL DEFAULT '',
  google_maps_url       TEXT NOT NULL DEFAULT '',
  status                TEXT NOT NULL DEFAULT 'Open',
  drug_license_no       TEXT NOT NULL DEFAULT '',
  fssai_license_no      TEXT NOT NULL DEFAULT '',
  pharmacist_name       TEXT NOT NULL DEFAULT '',
  gstin                 TEXT NOT NULL DEFAULT '',
  CONSTRAINT store_singleton CHECK (id = 1)
);

INSERT INTO store (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS categories (
  id        SERIAL PRIMARY KEY,
  name      TEXT NOT NULL,
  section   TEXT NOT NULL CHECK (section IN ('fruits','medicines')),
  sort      INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS categories_section_idx  ON categories (section);
CREATE INDEX IF NOT EXISTS categories_sort_idx     ON categories (sort);

CREATE TABLE IF NOT EXISTS items (
  id                      SERIAL PRIMARY KEY,
  category_id             INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  section                 TEXT NOT NULL CHECK (section IN ('fruits','medicines')),

  name                    TEXT NOT NULL,
  description             TEXT NOT NULL DEFAULT '',
  price                   INTEGER NOT NULL DEFAULT 0,
  image                   TEXT NOT NULL DEFAULT '',
  sort                    INTEGER NOT NULL DEFAULT 0,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  is_featured             BOOLEAN NOT NULL DEFAULT FALSE,
  in_stock                BOOLEAN NOT NULL DEFAULT TRUE,

  -- Fruits-only
  unit                    TEXT,
  weight_options          JSONB,
  is_organic              BOOLEAN NOT NULL DEFAULT FALSE,
  origin                  TEXT NOT NULL DEFAULT '',
  is_seasonal             BOOLEAN NOT NULL DEFAULT FALSE,

  -- Medicines-only
  brand                   TEXT NOT NULL DEFAULT '',
  dosage                  TEXT NOT NULL DEFAULT '',
  form                    TEXT,
  pack_size               TEXT NOT NULL DEFAULT '',
  requires_prescription   BOOLEAN NOT NULL DEFAULT FALSE,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS items_category_idx ON items (category_id);
CREATE INDEX IF NOT EXISTS items_section_idx  ON items (section);
CREATE INDEX IF NOT EXISTS items_sort_idx     ON items (sort);
