// Admin: every link with plays, likes, comments and owner; DELETE ?id= takes one down.
import { requireAdmin, allShares } from './admin.js';
import { getPlays } from './counter.js';
import { socialCounts } from './social.js';
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
