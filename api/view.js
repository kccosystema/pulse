// The share page: /s/:id → this function (see vercel.json rewrites).
// Rendered on the server so link previews (iMessage, WhatsApp, socials)
// show the cover, song and artist.
import { getJSON, storageMode, blobAuth } from '../lib/storage.js';
import { renderView, renderNotFound } from '../lib/view-template.js';
import { isExpired } from '../lib/shares.js';

const html = (body, status, cache) =>
  new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': cache } });

export async function GET(request) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || '';
  if (!/^[A-Za-z0-9]{6,24}$/.test(id) || storageMode() === 'none') return html(renderNotFound(), 404, 'no-store');
  let manifest = null;
  try {
    manifest = await getJSON(`shares/${id}.json`, blobAuth(request));
  } catch (err) {
    console.error('share load failed', err);
    return html(renderNotFound('Something went wrong loading this song. Try again in a moment.'), 500, 'no-store');
  }
  if (!manifest) return html(renderNotFound(), 404, 'public, max-age=0, s-maxage=30');
  if (isExpired(manifest)) return html(renderNotFound('This link has expired. Guest links last 30 days.'), 410, 'public, max-age=0, s-maxage=300');
  // Never expose ownership or claim data to the page.
  const { owner, claimHash, ...publicManifest } = manifest;
  manifest = publicManifest;
  const origin = `${url.protocol}//${request.headers.get('x-forwarded-host') || url.host}`;
  return html(renderView(manifest, origin), 200, 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
}
