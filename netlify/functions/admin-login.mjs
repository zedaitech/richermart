import { json, errorResponse, readJsonBody } from './_db.mjs';
import { checkAdminPassword, signToken } from './_auth.mjs';

// POST /api/admin/login  { password }
// → { token } on success, 401 otherwise.

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const { password } = await readJsonBody(event);
    if (!checkAdminPassword(password)) {
      await new Promise(r => setTimeout(r, 400)); // tiny delay to blunt brute force
      return json(401, { error: 'Incorrect password' });
    }
    return json(200, { token: signToken(), expiresInSeconds: 60 * 60 * 12 });
  } catch (err) {
    return errorResponse(err);
  }
}
