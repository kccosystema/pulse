// Public: the newest songs for the home page slider (only what the share page
// already shows publicly). Skips expired links and songs the creator chose not
// to feature. Cached at the edge for a few minutes.
import { storageMode, blobAuth } from '../lib/storage.js';
import { allShares } from '../lib/admin.js';
import { isExpired } from '../lib/shares.js';
import { json } from '../lib/http.js';

const LIMIT = 24;

export async function GET(request) {
  if (storageMode() === 'none') return json({ songs: [] });
  try {
    const shares = await allShares(blobAuth(request));
    const songs = shares
      .filter((m) => m.featured !== false && !isExpired(m) && m.image && m.image.url)
      .slice(0, LIMIT)
      .map((m) => ({ id: m.id, title: m.title, artist: m.artist, image: m.image.url }));
    return json({ songs }, 200, { 'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600' });
  } catch (err) {
    console.error('recent failed', err);
    return json({ songs: [] }, 200, { 'cache-control': 'public, s-maxage=30' });
  }
}
