// Called by the app when a signed-in user opens it: records/refreshes them in
// the users table (for the admin Users list) and says whether they're an admin.
// Profile fields come from verified token claims when available, otherwise
// from what the browser reports (display only; never used for permissions).
import { getUser, isAdmin } from '../lib/auth.js';
import { hasDb, query } from '../lib/db.js';
import { track } from '../lib/analytics.js';
import { json } from '../lib/http.js';

const str = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);

export async function POST(request) {
  const user = await getUser(request);
  if (!user) return json({ error: 'Sign in first' }, 401);
  let b = {};
  try { b = await request.json(); } catch {}
  const email = user.email || str(b.email, 200);
  const name = user.name || str(b.name, 200);
  const img = user.imageUrl || str(b.imageUrl, 500);
  const image = img && img.startsWith('https://') ? img : null;
  if (hasDb()) {
    try {
      const rows = await query(
        `INSERT INTO users (id, email, name, image_url) VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET email = COALESCE(EXCLUDED.email, users.email),
           name = COALESCE(EXCLUDED.name, users.name), image_url = COALESCE(EXCLUDED.image_url, users.image_url),
           last_seen = now()
         RETURNING (xmax = 0) AS inserted`, [user.userId, email, name, image]);
      if (rows[0] && rows[0].inserted) await track('signup', request, { userId: user.userId });
    } catch (err) {
      console.error('user upsert failed', err.message);
    }
  }
  return json({ admin: isAdmin(user), emailClaim: !!user.email });
}
