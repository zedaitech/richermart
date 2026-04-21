import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
import { json, errorResponse } from './_db.mjs';
import { requireAuth } from './_auth.mjs';

// Authenticated admin file upload (e.g. UPI QR image).
// Accepts multipart/form-data with a "file" field or a raw image body.
// Returns { id, url } pointing to /api/assets/:id.

const MAX_BYTES = 3 * 1024 * 1024; // 3 MB — plenty for a QR screenshot
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
]);

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    requireAuth(event);

    const ct = (event.headers['content-type'] || event.headers['Content-Type'] || '').toLowerCase();
    let bytes, mime, filename;

    if (ct.startsWith('multipart/form-data')) {
      ({ bytes, mime, filename } = parseSingleFileFromMultipart(event, ct));
    } else {
      bytes = event.isBase64Encoded
        ? Buffer.from(event.body || '', 'base64')
        : Buffer.from(event.body || '', 'utf8');
      mime = ct || 'application/octet-stream';
      filename = (event.headers['x-filename'] || '').toString().slice(0, 180) || 'asset';
    }

    if (!bytes || bytes.length === 0) return json(400, { error: 'Empty upload' });
    if (bytes.length > MAX_BYTES) return json(413, { error: 'File too large (max 3 MB)' });
    if (!ALLOWED_TYPES.has(mime)) return json(415, { error: `Unsupported type: ${mime}` });

    const ext = extFor(mime);
    const id = crypto.randomBytes(16).toString('hex') + ext;

    const store = getStore('store-assets');
    await store.set(id, bytes, { metadata: { mime, filename, size: bytes.length } });

    const host = (event.headers['x-forwarded-host'] || event.headers.host || '').toString();
    const proto = (event.headers['x-forwarded-proto'] || 'https').toString();
    const url = host ? `${proto}://${host}/api/assets/${id}` : `/api/assets/${id}`;

    return json(200, { id, url, filename, mime, size: bytes.length });
  } catch (err) {
    return errorResponse(err);
  }
}

function extFor(mime) {
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/gif') return '.gif';
  return '';
}

function parseSingleFileFromMultipart(event, ct) {
  const m = ct.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!m) { const e = new Error('Missing multipart boundary'); e.statusCode = 400; throw e; }
  const boundary = '--' + (m[1] || m[2]).trim();

  const raw = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64')
    : Buffer.from(event.body || '', 'binary');

  const parts = splitBuffer(raw, Buffer.from(boundary));
  for (const part of parts) {
    if (part.length < 4) continue;
    const headerEnd = indexOf(part, Buffer.from('\r\n\r\n'));
    if (headerEnd < 0) continue;
    const headers = part.slice(0, headerEnd).toString('utf8');
    let body = part.slice(headerEnd + 4);
    if (body.slice(-2).toString() === '\r\n') body = body.slice(0, -2);

    const disp = /content-disposition:[^\n]*filename="([^"]+)"/i.exec(headers);
    if (!disp) continue;
    const typeM = /content-type:\s*([^\r\n]+)/i.exec(headers);
    return {
      bytes: body,
      mime: (typeM ? typeM[1] : 'application/octet-stream').trim().toLowerCase(),
      filename: disp[1].slice(0, 180),
    };
  }
  const e = new Error('No file field found');
  e.statusCode = 400; throw e;
}

function indexOf(buf, needle, from = 0) {
  outer: for (let i = from; i <= buf.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (buf[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

function splitBuffer(buf, sep) {
  const out = [];
  let start = 0, idx;
  while ((idx = indexOf(buf, sep, start)) >= 0) {
    if (idx > start) out.push(buf.slice(start, idx));
    start = idx + sep.length;
  }
  return out;
}
