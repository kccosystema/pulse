// A signed-in user's links: GET lists them, DELETE ?id= removes one (the
// page, cover and song), POST claims guest links made on this device.
import { getUser } from '../lib/auth.js';
import { blobAuth, getJSON } from '../lib/storage.js';
import { listUserShares, deleteShare, isShareId, sharePath, claimShare } from '../lib/shares.js';
import { json } from '../lib/http.js';

export async function GET(request) {
  const user = await getUser(request);
  if (!user) return json({ error: 'Sign in first' }, 401);
  const origin = new URL(request.url).origin;
  const links = await listUserShares(user.userId, blobAuth(request));
  return json({ links: links.map((l) => ({ ...l, url: `${origin}/s/${l.id}` })) });
}

export async function DELETE(request) {
  const user = await getUser(request);
  if (!user) return json({ error: 'Sign in first' }, 401);
  const id = new URL(request.url).searchParams.get('id');
  if (!isShareId(id)) return json({ error: 'Bad request' }, 400);
  const auth = blobAuth(request);
  const m = await getJSON(sharePath(id), auth);
  if (!m) return json({ ok: true });
  if (m.owner !== user.userId) return json({ error: 'Not your link' }, 403);
  await deleteShare(m, auth);
  return json({ ok: true });
}

// After signing in, the browser hands over the claim tokens of guest links it
// created, which makes them permanent and lists them under the account.
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
