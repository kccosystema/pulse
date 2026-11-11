// Comments on a share page.
//   GET ?id=                  newest comments (anyone); with a sign-in token,
//                             each comment says whether this user may delete it
//   POST ?id=  {text}         add a comment (signed in only)
//   DELETE ?id=&comment=<n>   remove one: its author, the song's owner or an admin
import { socialMode, listComments, addComment, getComment, deleteComment, cleanComment, COMMENT_MAX } from '../lib/social.js';
import { getUser, isAdmin } from '../lib/auth.js';
import { isShareId, sharePath, isExpired } from '../lib/shares.js';
import { getJSON, blobAuth } from '../lib/storage.js';
import { json } from '../lib/http.js';
import { track } from '../lib/analytics.js';

async function loadShare(request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!isShareId(id)) return null;
  const m = await getJSON(sharePath(id), blobAuth(request)).catch(() => null);
  return m && !isExpired(m) ? m : null;
}

const mayDelete = (user, m) => (c) => !!user && (c.user_id === user.userId || m.owner === user.userId || isAdmin(user));

function shape(c, canDelete) {
  return { id: String(c.id), name: c.name, image: c.image_url || null, body: c.body, at: new Date(c.created_at).toISOString(), canDelete };
}

export async function GET(request) {
  if (socialMode() === 'none') return json({ enabled: false, comments: [] });
  try {
    const m = await loadShare(request);
    if (!m) return json({ error: 'Not found' }, 404);
    const user = await getUser(request);
    return json({ enabled: true, comments: await listComments(m.id, mayDelete(user, m)) });
  } catch (err) {
    console.error('comments read failed', err);
    return json({ enabled: false, comments: [] });
  }
}

export async function POST(request) {
  if (socialMode() === 'none') return json({ error: 'Comments aren’t available right now' }, 503);
  const user = await getUser(request);
  if (!user) return json({ error: 'Sign in to comment' }, 401);
  const raw = await request.text();
  if (raw.length > 8 * 1024) return json({ error: 'That comment is too long' }, 413);
  let text = '';
  try { text = cleanComment(JSON.parse(raw).text); } catch { return json({ error: 'Bad request' }, 400); }
  if (!text) return json({ error: 'Write something first' }, 400);
  if (text.length > COMMENT_MAX) return json({ error: `Comments can be up to ${COMMENT_MAX} characters` }, 400);
  try {
    const m = await loadShare(request);
    if (!m) return json({ error: 'Not found' }, 404);
    const r = await addComment(m.id, user, text);
    if (!r.ok) return json({ error: r.error }, r.status);
    await track('comment', request, { shareId: m.id, userId: user.userId });
    return json({ comment: shape(r.comment, true) });
  } catch (err) {
    console.error('comment failed', err);
    return json({ error: 'Could not post your comment' }, 500);
  }
}

export async function DELETE(request) {
  if (socialMode() === 'none') return json({ error: 'Not available' }, 503);
  const user = await getUser(request);
  if (!user) return json({ error: 'Sign in first' }, 401);
  const cid = new URL(request.url).searchParams.get('comment') || '';
  if (!/^\d{1,18}$/.test(cid)) return json({ error: 'Bad request' }, 400);
  try {
    const m = await loadShare(request);
    const c = await getComment(cid);
    if (!m || !c || c.share_id !== m.id) return json({ error: 'Not found' }, 404);
    if (!mayDelete(user, m)(c)) return json({ error: 'Not your comment' }, 403);
    await deleteComment(cid);
    return json({ deleted: true });
  } catch (err) {
    console.error('comment delete failed', err);
    return json({ error: 'Could not delete the comment' }, 500);
  }
}
