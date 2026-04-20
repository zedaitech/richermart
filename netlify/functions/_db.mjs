import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) {
  console.warn('DATABASE_URL is not set. Set it in Netlify site env vars.');
}

export const sql = url ? neon(url) : null;

export function requireDb() {
  if (!sql) {
    const err = new Error('DATABASE_URL not configured on the server');
    err.statusCode = 500;
    throw err;
  }
  return sql;
}

export function json(status, body, extraHeaders = {}) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

export function errorResponse(err) {
  const code = err && err.statusCode ? err.statusCode : 500;
  const message = err && err.message ? err.message : 'Internal error';
  if (code >= 500) console.error('fn error:', err);
  return json(code, { error: message });
}

export async function readJsonBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  try { return JSON.parse(raw); }
  catch { const e = new Error('Invalid JSON body'); e.statusCode = 400; throw e; }
}
