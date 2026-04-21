import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

// Public prescription upload → Netlify Blobs.
// POST /api/rx-upload  (multipart/form-data, field "file")
// Returns { id, url } — url is a public /api/rx/:id link.

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
]);

export default async (req) => {
  if (req.method !== 'POST') return jsonRes(405, { error: 'Method not allowed' });

  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') return jsonRes(400, { error: 'No file field' });
    if (file.size === 0) return jsonRes(400, { error: 'Empty upload' });
    if (file.size > MAX_BYTES) return jsonRes(413, { error: 'File too large (max 5 MB)' });
    const mime = (file.type || '').toLowerCase();
    if (!ALLOWED_TYPES.has(mime)) return jsonRes(415, { error: `Unsupported type: ${mime || 'unknown'}` });

    const buf = Buffer.from(await file.arrayBuffer());
    const id = crypto.randomBytes(16).toString('hex') + extFor(mime);

    const store = getStore('prescriptions');
    await store.set(id, buf, { metadata: { mime, filename: file.name || 'rx', size: file.size } });

    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
    const proto = req.headers.get('x-forwarded-proto') || 'https';
    const url = host ? `${proto}://${host}/api/rx/${id}` : `/api/rx/${id}`;

    return jsonRes(200, { id, url, filename: file.name, mime, size: file.size });
  } catch (err) {
    console.error('rx-upload error:', err);
    return jsonRes(err.statusCode || 500, { error: err.message || 'Internal error' });
  }
};

function extFor(mime) {
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/heic') return '.heic';
  if (mime === 'image/heif') return '.heif';
  if (mime === 'application/pdf') return '.pdf';
  return '';
}

function jsonRes(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
