import { getStore } from '@netlify/blobs';

// Serve a previously-uploaded prescription (customer Rx) back to WhatsApp / browsers.
// GET /api/rx/:id — v2 Function with native path-parameter routing.

export default async (req, context) => {
  if (req.method !== 'GET') return jsonRes(405, { error: 'Method not allowed' });
  try {
    const id = (context.params && context.params.id) || '';
    if (!/^[a-f0-9]{32}(?:\.[a-z0-9]{1,5})?$/i.test(id)) {
      return jsonRes(400, { error: 'Invalid id' });
    }

    const store = getStore('prescriptions');
    const result = await store.getWithMetadata(id, { type: 'arrayBuffer' });
    if (!result) return jsonRes(404, { error: 'Not found' });

    const mime = (result.metadata && result.metadata.mime) || 'application/octet-stream';
    return new Response(Buffer.from(result.data), {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'private, max-age=604800, immutable',
        'Content-Disposition': `inline; filename="prescription${extFor(mime)}"`,
      },
    });
  } catch (err) {
    console.error('rx-file error:', err);
    return jsonRes(err.statusCode || 500, { error: err.message || 'Internal error' });
  }
};

export const config = { path: '/api/rx/:id' };

function extFor(mime) {
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'application/pdf') return '.pdf';
  return '';
}

function jsonRes(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
