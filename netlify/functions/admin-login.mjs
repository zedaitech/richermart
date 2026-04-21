import { requireDb, json, errorResponse, readJsonBody } from './_db.mjs';
import {
  checkAdminPassword, signToken,
  getClientIp, checkAndBumpRateLimit, recordFailedAttempt, clearAttempts,
} from './_auth.mjs';

// POST /api/admin/login  { password }
// Rate-limited: 5 attempts / 5 minutes / IP → 429 with Retry-After.
// On success: { token, expiresInSeconds }. On wrong pw: 401.

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const sql = requireDb();
  const ip = getClientIp(event);

  try {
    await checkAndBumpRateLimit(sql, ip);
  } catch (err) {
    if (err.statusCode === 429) {
      return json(429, { error: err.message }, { 'Retry-After': String(err.retryAfter || 300) });
    }
    return errorResponse(err);
  }

  try {
    const { password } = await readJsonBody(event);
    if (!checkAdminPassword(password)) {
      await recordFailedAttempt(sql, ip);
      await new Promise(r => setTimeout(r, 400)); // blunts timing attacks slightly
      return json(401, { error: 'Incorrect password' });
    }
    await clearAttempts(sql, ip);
    return json(200, { token: signToken(), expiresInSeconds: 60 * 60 * 12 });
  } catch (err) {
    return errorResponse(err);
  }
}
