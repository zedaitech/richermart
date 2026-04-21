import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
import { verifyToken } from './_auth.mjs';

// Authenticated admin file upload (UPI QR image, etc.)
// POST /api/admin/upload  (multipart/form-data, field "file")
// Returns { id, url } — url is a public /api/assets/:id link.
//
// Uses the v2 Functions format so req.formData() handles multipart parsing
// and @netlify/blobs auto-configures against the current site.

const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
]);

export default async (req) => {
  if (req.method !== 'POST') return jsonRes(405, { error: 'Method not allowed' });

  try {
    const auth = req.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!verifyToken(token)) return jsonRes(401, { error: 'Unauthorized' });

    const form = await req.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') return jsonRes(400, { error: 'No file field' });
    if (file.size === 0) return jsonRes(400, { error: 'Empty upload' });
    if (file.size > MAX_BYTES) return jsonRes(413, { error: 'File too large (max 3 MB)' });
    const mime = (file.type || '').toLowerCase();
    if (!ALLOWED_TYPES.has(mime)) return jsonRes(415, { error: `Unsupported type: ${mime || 'unknown'}` });

    const buf = Buffer.from(await file.arrayBuffer());
    const id = crypto.randomBytes(16).toString('hex') + extFor(mime);

    const store = getStore('store-assets');
    await store.set(id, buf, { metadata: { mime, filename: file.name || 'asset', size: file.size } });

    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
    const proto = req.headers.get('x-forwarded-proto') || 'https';
    const url = host ? `${proto}://${host}/api/assets/${id}` : `/api/assets/${id}`;

    return jsonRes(200, { id, url, filename: file.name, mime, size: file.size });
  } catch (err) {
    console.error('admin-upload error:', err);
    return jsonRes(err.statusCode || 500, { error: err.message || 'Internal error' });
  }
};

function extFor(mime) {
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/gif') return '.gif';
  return '';
}

function jsonRes(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
