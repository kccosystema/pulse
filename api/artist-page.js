// Public artist page: /a/:slug → this function (vercel.json rewrite).
// Only artists whose page is switched on; lists that user's songs for the artist.
import { publicArtistBySlug, artistsEnabled } from '../lib/artists.js';
import { renderArtist } from '../lib/artist-template.js';
import { listUserShares } from '../lib/shares.js';
import { getPlays } from '../lib/counter.js';
import { blobAuth, storageMode } from '../lib/storage.js';
import { renderNotFound } from '../lib/view-template.js';

const html = (body, status, cache) =>
  new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': cache } });

export async function GET(request) {
  const url = new URL(request.url);
  const slug = (url.searchParams.get('slug') || '').toLowerCase();
  if (!artistsEnabled() || storageMode() === 'none') return html(renderNotFound('This artist page doesn’t exist.'), 404, 'no-store');
  try {
    const a = await publicArtistBySlug(slug);
    if (!a) return html(renderNotFound('This artist page doesn’t exist or was turned off.'), 404, 'public, max-age=0, s-maxage=30');
    const name = a.name.toLowerCase();
    const mine = (await listUserShares(a.userId, blobAuth(request)))
      // Songs saved with this artist picked, or older songs with the same artist name.
      .filter((s) => (s.artistId ? s.artistId === a.id : String(s.artist || '').toLowerCase() === name));
    const plays = await getPlays(mine.map((s) => s.id)).catch(() => ({}));
    const songs = mine.map((s) => ({ ...s, plays: plays[s.id] || 0 }));
    const origin = `${url.protocol}//${request.headers.get('x-forwarded-host') || url.host}`;
    return html(renderArtist(a, songs, origin), 200, 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
  } catch (err) {
    console.error('artist page failed', err);
    return html(renderNotFound('Something went wrong loading this page. Try again in a moment.'), 500, 'no-store');
  }
}
