# Admin & Deployment

Deployment target: **Netlify (static + Functions)** + **Neon (Postgres)** + **Netlify Blobs** (prescription uploads).

---

## One-time setup

### 1. Create a Neon database
1. Sign up at <https://neon.tech> (free tier is fine).
2. Create a new project. Copy the **connection string** (use the *pooled* URL, e.g. `postgres://user:pass@ep-xyz-pooler.neon.tech/neondb?sslmode=require`).

### 2. Seed the database
Run the seeder locally — it creates the schema from [`migrations/001_init.sql`](../migrations/001_init.sql) and imports the sample catalog from [`menu.json`](../menu.json).

```bash
cd admin
npm install
DATABASE_URL="postgres://user:pass@host/db?sslmode=require" node seed.mjs
# Pass --force to wipe and re-seed from menu.json
```

### 3. Create the Netlify site
1. Push this repo to GitHub.
2. On Netlify: **Add new site → Import from Git →** pick the repo.
3. Build settings are already in [`netlify.toml`](../netlify.toml) — leave defaults.
4. Add these **environment variables** (Site settings → Environment variables):

   | Variable | Value | Notes |
   |---|---|---|
   | `DATABASE_URL` | your Neon pooled connection string | required |
   | `ADMIN_PASSWORD` | whatever you want to use to sign in | required |
   | `AUTH_SECRET` | random 32+ char string (`openssl rand -base64 32`) | required — signs the admin session token |

5. Deploy. Netlify picks up the Functions in [`netlify/functions/`](../netlify/functions) automatically.

### 4. Use the admin
- Visit **`https://your-site.netlify.app/admin/`**
- Sign in with `ADMIN_PASSWORD`
- Edit the **Store** singleton, add **Categories**, and create **Items**

Public storefront is at `https://your-site.netlify.app/` — it reads from `/api/catalog` (which hits Neon via the serverless function).

---

## Local development

Use the Netlify CLI to run Functions + static site together:

```bash
npm install -g netlify-cli
cd /path/to/project
npm install                # installs @neondatabase/serverless + @netlify/blobs for functions
netlify dev                # serves site at http://localhost:8888 with /api/* working
```

Set env vars locally via a `.env` file at the repo root (Netlify CLI reads it):

```
DATABASE_URL=postgres://...
ADMIN_PASSWORD=devpassword
AUTH_SECRET=some-random-32-char-string
```

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Netlify (static hosting + Functions + Blobs)              │
│                                                            │
│   /                      → index.html (storefront)         │
│   /admin/                → admin/index.html (CRUD UI)      │
│   /api/catalog           → catalog.mjs        (public)     │
│   /api/rx-upload         → rx-upload.mjs      (public POST)│
│   /api/rx/:id            → rx-file.mjs        (serves blob)│
│   /api/admin/login       → admin-login.mjs                 │
│   /api/admin/store       → admin-store.mjs                 │
│   /api/admin/categories  → admin-categories.mjs            │
│   /api/admin/items       → admin-items.mjs                 │
└──────────────────┬──────────────────┬──────────────────────┘
                   │                  │
            ┌──────▼────────┐   ┌─────▼──────────────┐
            │ Neon Postgres │   │ Netlify Blobs       │
            │  store        │   │  prescriptions/     │
            │  categories   │   └─────────────────────┘
            │  items        │
            └───────────────┘
```

- **Auth**: one admin password (`ADMIN_PASSWORD` env var). On successful sign-in the server returns an HMAC-signed token (12h TTL) that the browser stores in `localStorage` and sends as `Authorization: Bearer ...`. No user table.
- **Database**: Neon accessed via `@neondatabase/serverless` (HTTP driver — no connection pool to manage).
- **File storage**: Prescription uploads go into the `prescriptions` Netlify Blob store; they're served back through `/api/rx/:id` so the WhatsApp message contains a direct viewable link.
- **Caching**: `/api/catalog` is cached at the Netlify edge for 15–30s with stale-while-revalidate, so product edits appear within ~30s without hammering Neon.

## Schema

See [`migrations/001_init.sql`](../migrations/001_init.sql). Tables:
- `store` — singleton (`id = 1`); name, phone, licenses, GSTIN, etc.
- `categories` — `section ∈ {'fruits','medicines'}`, sort, is_active
- `items` — shared fields + fruits-only (`unit`, `weight_options` JSONB, `is_organic`, `origin`, `is_seasonal`) + medicines-only (`brand`, `dosage`, `form`, `pack_size`, `requires_prescription`)

## Cost

Free tier should cover a single-store catalog:
- Neon: 0.5 GB storage, ~191 compute-hours/mo free
- Netlify: 125k Function requests/mo, 100 GB bandwidth free
- Netlify Blobs: 10 GB storage, 10 GB bandwidth free

## Troubleshooting

| Symptom | Fix |
|---|---|
| Storefront shows sample data, admin can't log in | `DATABASE_URL` and/or `ADMIN_PASSWORD` not set in Netlify env vars |
| Admin login returns 500 | `AUTH_SECRET` is missing or shorter than 16 chars |
| `netlify dev` can't find functions | Run from the repo root, not from `admin/` |
| Edited a product but storefront still shows old value | Edge cache; reloads within 30s. Hard-reload to force. |
| Want to reset everything | Run `node seed.mjs --force` to wipe & re-seed from `menu.json` |
