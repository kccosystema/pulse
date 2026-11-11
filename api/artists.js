// Saved artists for the signed-in user.
//   GET                      list
//   POST {name, website, links}            create
//   PATCH ?id= {name, website, links}      update
//   DELETE ?id=                            delete
import { getUser } from '../lib/auth.js';
import { artistsEnabled, listArtists, createArtist, updateArtist, deleteArtist, cleanArtist } from '../lib/artists.js';
import { json } from '../lib/http.js';

async function who(request) {
  if (!artistsEnabled()) return json({ error: 'Saved artists aren’t available right now' }, 503);
  const user = await getUser(request);
  return user || json({ error: 'Sign in first' }, 401);
}
async function body(request) {
  const t = await request.text();
  if (t.length > 8 * 1024) return null;
  try { return JSON.parse(t); } catch { return null; }
}
const idOf = (request) => {
  const id = new URL(request.url).searchParams.get('id') || '';
  return /^\d{1,18}$/.test(id) ? id : null;
};

export async function GET(request) {
  const u = await who(request);
  if (u instanceof Response) return u;
  return json({ artists: await listArtists(u.userId) });
}

export async function POST(request) {
  const u = await who(request);
  if (u instanceof Response) return u;
  const a = cleanArtist(await body(request));
  if (a.error) return json({ error: a.error }, 400);
  const r = await createArtist(u.userId, a);
  return r.error ? json({ error: r.error }, 400) : json(r);
}

export async function PATCH(request) {
  const u = await who(request);
  if (u instanceof Response) return u;
  const id = idOf(request);
  if (!id) return json({ error: 'Bad request' }, 400);
  const a = cleanArtist(await body(request));
  if (a.error) return json({ error: a.error }, 400);
  const artist = await updateArtist(u.userId, id, a);
  return artist ? json({ artist }) : json({ error: 'Not found' }, 404);
}

export async function DELETE(request) {
  const u = await who(request);
  if (u instanceof Response) return u;
  const id = idOf(request);
  if (!id) return json({ error: 'Bad request' }, 400);
  await deleteArtist(u.userId, id);
  return json({ deleted: true });
}
