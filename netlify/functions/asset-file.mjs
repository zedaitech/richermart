import { getStore } from '@netlify/blobs';
import { json, errorResponse } from './_db.mjs';

// Public read of admin-uploaded assets (UPI QR image, etc.)
// GET /api/assets/:id

export async function handler(event) {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });
  try {
    const id = (event.queryStringParameters && event.queryStringParameters.id) || '';
    if (!/^[a-f0-9]{32}(?:\.[a-z0-9]{1,5})?$/i.test(id)) {
      return json(400, { error: 'Invalid id' });
    }
    const store = getStore('store-assets');
    const result = await store.getWithMetadata(id, { type: 'arrayBuffer' });
    if (!result) return json(404, { error: 'Not found' });

    const mime = (result.metadata && result.metadata.mime) || 'application/octet-stream';
    return {
      statusCode: 200,
      headers: {
        'Content-Type': mime,
        // Immutable — the id already carries content hashing via randomBytes.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
      body: Buffer.from(result.data).toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    return errorResponse(err);
  }
}
