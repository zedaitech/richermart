import { getStore } from '@netlify/blobs';

// Public read of admin-uploaded assets (UPI QR image, etc.)
// GET /api/assets/:id — v2 Function with native path-parameter routing.

export default async (req, context) => {
  if (req.method !== 'GET') return jsonRes(405, { error: 'Method not allowed' });
  try {
    const id = (context.params && context.params.id) || '';
    if (!/^[a-f0-9]{32}(?:\.[a-z0-9]{1,5})?$/i.test(id)) {
      return jsonRes(400, { error: 'Invalid id' });
    }

    const store = getStore('store-assets');
    const result = await store.getWithMetadata(id, { type: 'arrayBuffer' });
    if (!result) return jsonRes(404, { error: 'Not found' });

    const mime = (result.metadata && result.metadata.mime) || 'application/octet-stream';
    return new Response(Buffer.from(result.data), {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err) {
    console.error('asset-file error:', err);
    return jsonRes(err.statusCode || 500, { error: err.message || 'Internal error' });
  }
};

export const config = { path: '/api/assets/:id' };

function jsonRes(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
