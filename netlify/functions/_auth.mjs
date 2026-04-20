import crypto from 'node:crypto';

// Admin auth: single-password gate. Signed token = HMAC of { exp } using AUTH_SECRET.
// No user records, no DB rows. Simple and enough for a single-admin catalog.

const TOKEN_TTL_SECONDS = 60 * 60 * 12; // 12h

function getSecret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    const err = new Error('AUTH_SECRET must be set to a random string of 16+ chars');
    err.statusCode = 500;
    throw err;
  }
  return s;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlDecode(str) {
  const pad = str.length % 4 === 2 ? '==' : str.length % 4 === 3 ? '=' : '';
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export function signToken() {
  const payload = { exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac('sha256', getSecret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;
  const [body, sig] = token.split('.');
  const expected = b64url(crypto.createHmac('sha256', getSecret()).update(body).digest());
  if (!timingSafeEq(sig, expected)) return false;
  try {
    const payload = JSON.parse(b64urlDecode(body).toString('utf8'));
    if (typeof payload.exp !== 'number') return false;
    return payload.exp > Math.floor(Date.now() / 1000);
  } catch { return false; }
}

function timingSafeEq(a, b) {
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
  catch { return false; }
}

export function checkAdminPassword(password) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    const err = new Error('ADMIN_PASSWORD not configured on the server');
    err.statusCode = 500;
    throw err;
  }
  if (typeof password !== 'string') return false;
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function requireAuth(event) {
  const header = event.headers && (event.headers.authorization || event.headers.Authorization);
  const token = header && header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!verifyToken(token)) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }
}
