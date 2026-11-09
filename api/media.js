// Same-origin pass-through for shared songs, used only if the browser can't
// load the song directly from Blob with CORS (Web Audio needs CORS).
import { isOurMediaUrl } from '../lib/storage.js';

export async function GET(request) {
  const u = new URL(request.url).searchParams.get('u') || '';
  if (!isOurMediaUrl(u) || u.startsWith('/')) return new Response('Not found', { status: 404 });
  const range = request.headers.get('range');
  const upstream = await fetch(u, { headers: range ? { range } : {} });
  const headers = new Headers();
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  return new Response(upstream.body, { status: upstream.status, headers });
}
