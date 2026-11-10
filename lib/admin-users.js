// Admin: everyone who has signed in, with their link and play totals.
import { requireAdmin, linkCounts } from './admin.js';
import { hasDb, query } from './db.js';
import { listPaths } from './storage.js';
import { getPlays } from './counter.js';
import { json } from './http.js';

export async function usersGET(request) {
  const a = await requireAdmin(request);
  if (a instanceof Response) return a;
  const counts = await linkCounts(a.auth);
  // plays per user = sum over their links (owners/<user>/<id>.json)
  const owned = {};
  for (const it of await listPaths('owners/', a.auth)) {
    const [, u, f] = it.pathname.split('/');
    if (u && f) (owned[u] ||= []).push(f.replace(/\.json$/, ''));
  }
  const plays = await getPlays(Object.values(owned).flat()).catch(() => ({}));
  const rows = hasDb()
    ? await query('SELECT id, email, name, image_url, created_at, last_seen FROM users ORDER BY created_at DESC LIMIT 5000')
    : [];
  const safe = (id) => String(id).replace(/[^\w-]/g, '_').slice(0, 80); // same as owners/ folder names
  const seen = new Set();
  const users = rows.map((r) => {
    seen.add(safe(r.id));
    const ids = owned[safe(r.id)] || [];
    return {
      id: r.id, email: r.email, name: r.name, imageUrl: r.image_url,
      createdAt: r.created_at, lastSeen: r.last_seen,
      links: counts[safe(r.id)] || 0,
      plays: ids.reduce((s, id) => s + (plays[id] || 0), 0),
    };
  });
  // People who own links but haven't opened the app since accounts were tracked.
  for (const u of Object.keys(owned)) {
    if (seen.has(u)) continue;
    users.push({ id: u, email: null, name: null, imageUrl: null, createdAt: null, lastSeen: null,
      links: counts[u] || 0, plays: owned[u].reduce((s, id) => s + (plays[id] || 0), 0), untracked: true });
  }
  return json({ users });
}
