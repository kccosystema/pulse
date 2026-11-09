// After signing in, the browser hands over the claim tokens of guest links it
// created, which makes them permanent and lists them under the account.
import { getUser } from '../lib/auth.js';
import { blobAuth } from '../lib/storage.js';
import { claimShare } from '../lib/shares.js';
import { json } from '../lib/http.js';

export async function POST(request) {
  const user = await getUser(request);
  if (!user) return json({ error: 'Sign in first' }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const claims = Array.isArray(body?.claims) ? body.claims.slice(0, 50) : [];
  const auth = blobAuth(request);
  const claimed = [];
  for (const c of claims) {
    try { if (await claimShare(c?.id, c?.token, user.userId, auth)) claimed.push(c.id); }
    catch (err) { console.error('claim failed', c?.id, err); }
  }
  return json({ claimed });
}
