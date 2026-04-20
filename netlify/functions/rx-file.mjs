import { getStore } from '@netlify/blobs';
import { json, errorResponse } from './_db.mjs';

// Serve a previously-uploaded prescription back to WhatsApp / browsers.
// GET /api/rx/:id

export async function handler(event) {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });
  try {
    const id = (event.queryStringParameters && event.queryStringParameters.id) || '';
    if (!/^[a-f0-9]{32}(?:\.[a-z0-9]{1,5})?$/i.test(id)) {
      return json(400, { error: 'Invalid id' });
    }
    const store = getStore('prescriptions');
    const result = await store.getWithMetadata(id, { type: 'arrayBuffer' });
    if (!result) return json(404, { error: 'Not found' });

    const mime = (result.metadata && result.metadata.mime) || 'application/octet-stream';
    return {
      statusCode: 200,
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'private, max-age=604800, immutable',
        'Content-Disposition': `inline; filename="prescription${extFor(mime)}"`,
      },
      body: Buffer.from(result.data).toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    return errorResponse(err);
  }
}

function extFor(mime) {
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'application/pdf') return '.pdf';
  return '';
}
