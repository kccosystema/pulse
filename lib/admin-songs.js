// Admin: every link with plays, likes, comments and owner; DELETE ?id= takes one down.
import { requireAdmin, allShares } from './admin.js';
import { getPlays, setPlays, counterMode } from './counter.js';
import { socialCounts, socialMode, addSeedComment, cleanComment, COMMENT_MAX } from './social.js';
import { hasDb, query } from './db.js';
import { getJSON } from './storage.js';
import { deleteShare, isShareId, sharePath, isExpired } from './shares.js';
import { json } from './http.js';

export async function songsGET(request) {
  const a = await requireAdmin(request);
  if (a instanceof Response) return a;
  const shares = await allShares(a.auth);
  const plays = await getPlays(shares.map((m) => m.id)).catch(() => ({}));
  const social = await socialCounts(shares.map((m) => m.id)).catch(() => ({}));
  const users = {};
  if (hasDb()) {
    const owners = [...new Set(shares.map((m) => m.owner).filter(Boolean))];
    if (owners.length) {
      for (const r of await query('SELECT id, email, name FROM users WHERE id = ANY($1)', [owners]).catch(() => [])) users[r.id] = r;
    }
  }
  const origin = new URL(request.url).origin;
  return json({
    songs: shares.map((m) => ({
      id: m.id,
      url: `${origin}/s/${m.id}`,
      title: m.title,
      artist: m.artist,
      album: m.album || '',
      image: m.image && m.image.url,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt || null,
      expiresAt: m.expiresAt || null,
      expired: isExpired(m),
      owner: m.owner ? { id: m.owner, email: users[m.owner]?.email || null, name: users[m.owner]?.name || null } : null,
      plays: plays[m.id] || 0,
      likes: social[m.id]?.likes || 0,
      comments: social[m.id]?.comments || 0,
      bpm: m.analysis ? Math.round(m.analysis.bpm) : null,
      mine: !!m.owner && m.owner === a.user.userId,
    })),
  });
}

export async function songsDELETE(request) {
  const a = await requireAdmin(request);
  if (a instanceof Response) return a;
  const id = new URL(request.url).searchParams.get('id');
  if (!isShareId(id)) return json({ error: 'Bad request' }, 400);
  const m = await getJSON(sharePath(id), a.auth);
  if (!m) return json({ ok: true });
  await deleteShare(m, a.auth);
  console.log('admin deleted share', id);
  return json({ ok: true });
}

// The admin's own song, or a Response to send back.
async function ownSong(request, a, id) {
  if (!isShareId(id)) return json({ error: 'Bad request' }, 400);
  const m = await getJSON(sharePath(id), a.auth).catch(() => null);
  if (!m) return json({ error: 'Song not found' }, 404);
  if (m.owner !== a.user.userId) return json({ error: 'Only for songs on your own account' }, 403);
  return m;
}

async function body(request) {
  const raw = await request.text();
  if (raw.length > 8 * 1024) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// POST /api/admin/jams {id, count}: set a song's jam (play) count.
export async function jamsPOST(request) {
  const a = await requireAdmin(request);
  if (a instanceof Response) return a;
  const b = await body(request);
  if (!b) return json({ error: 'Bad request' }, 400);
  const m = await ownSong(request, a, b.id);
  if (m instanceof Response) return m;
  const n = Number(b.count);
  if (!Number.isInteger(n) || n < 0 || n > 100_000_000) return json({ error: 'Enter a whole number from 0 to 100,000,000' }, 400);
  if (counterMode() === 'none') return json({ error: 'Play counts aren’t set up' }, 503);
  const plays = await setPlays(m.id, n);
  console.log('admin set jams', m.id, plays);
  return json({ plays });
}

// POST /api/admin/comment {id, name, text}: add a comment under any name.
export async function commentPOST(request) {
  const a = await requireAdmin(request);
  if (a instanceof Response) return a;
  const b = await body(request);
  if (!b) return json({ error: 'Bad request' }, 400);
  const m = await ownSong(request, a, b.id);
  if (m instanceof Response) return m;
  const name = cleanComment(b.name).replace(/\s+/g, ' ').slice(0, 40);
  const text = cleanComment(b.text);
  if (!name) return json({ error: 'Add a display name' }, 400);
  if (!text) return json({ error: 'Write a comment' }, 400);
  if (text.length > COMMENT_MAX) return json({ error: `Comments can be up to ${COMMENT_MAX} characters` }, 400);
  if (socialMode() === 'none') return json({ error: 'Comments aren’t set up' }, 503);
  const c = await addSeedComment(m.id, name, text);
  return json({ comment: { id: String(c.id), name: c.name, body: c.body, at: new Date(c.created_at).toISOString() } });
}
