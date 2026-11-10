// Shared by the admin API routes.
import { getUser, isAdmin } from './auth.js';
import { blobAuth, listPaths, getJSON } from './storage.js';
import { json } from './http.js';

// Returns { user, auth } for the admin, or a Response to send back.
export async function requireAdmin(request) {
  const user = await getUser(request);
  if (!user) return json({ error: 'Sign in first' }, 401);
  if (!user.email) return json({ error: 'no-email-claim' }, 403);
  if (!isAdmin(user)) return json({ error: 'Not authorized' }, 403);
  return { user, auth: blobAuth(request) };
}

// Every share manifest (fetched in parallel, a few at a time).
export async function allShares(auth) {
  const items = (await listPaths('shares/', auth)).filter((it) => it.pathname.endsWith('.json'));
  const out = [];
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const it = items[i++];
      const m = await getJSON(it.pathname, auth).catch(() => null);
      if (m && m.id) out.push(m);
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, items.length) }, worker));
  return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

// { userId: number of links } from the owners/ index (one listing).
export async function linkCounts(auth) {
  const counts = {};
  for (const it of await listPaths('owners/', auth)) {
    const u = it.pathname.split('/')[1];
    if (u) counts[u] = (counts[u] || 0) + 1;
  }
  return counts;
}
