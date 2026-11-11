// Likes on a share page. GET ?id= → { likes, likedToday, comments }.
// POST ?id= adds one like for this visitor today (x-pulse-visitor header);
// see lib/social.js for the once-a-day and per-address limits.
import { socialMode, visitorOf, ipOf, getLikes, addLike, countComments } from '../lib/social.js';
import { isShareId, sharePath, isExpired } from '../lib/shares.js';
import { getJSON, blobAuth } from '../lib/storage.js';
import { json } from '../lib/http.js';
import { track } from '../lib/analytics.js';

const shareId = (request) => {
  const id = new URL(request.url).searchParams.get('id');
  return isShareId(id) ? id : null;
};

export async function GET(request) {
  if (socialMode() === 'none') return json({ enabled: false });
  const id = shareId(request);
  if (!id) return json({ error: 'Bad request' }, 400);
  try {
    const [l, comments] = await Promise.all([getLikes(id, visitorOf(request)), countComments(id)]);
    return json({ enabled: true, ...l, comments });
  } catch (err) {
    console.error('likes read failed', err);
    return json({ enabled: false });
  }
}

export async function POST(request) {
  if (socialMode() === 'none') return json({ enabled: false });
  const id = shareId(request);
  const visitor = visitorOf(request);
  if (!id || !visitor) return json({ error: 'Bad request' }, 400);
  try {
    const m = await getJSON(sharePath(id), blobAuth(request)).catch(() => null);
    if (!m || isExpired(m)) return json({ error: 'Not found' }, 404);
    const r = await addLike(id, visitor, ipOf(request));
    if (r.ok) {
      await track('like', request, { shareId: id });
      return json({ enabled: true, likes: r.likes, likedToday: true });
    }
    const error = r.reason === 'already'
      ? 'You already liked this today. Come back tomorrow!'
      : 'Lots of likes from your network today. Try again tomorrow.';
    return json({ enabled: true, likes: r.likes, likedToday: r.reason === 'already', error }, 429);
  } catch (err) {
    console.error('like failed', err);
    return json({ error: 'Could not save your like' }, 500);
  }
}
