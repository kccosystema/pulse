// A signed-in user's links: GET lists them, DELETE ?id= removes one
// (the page, cover and song).
import { getUser } from '../lib/auth.js';
import { blobAuth, getJSON } from '../lib/storage.js';
import { listUserShares, deleteShare, isShareId, sharePath } from '../lib/shares.js';
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
