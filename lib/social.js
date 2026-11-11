// Likes and comments on share pages. Postgres (lib/db.js) in production,
// in memory on the local dev server when no database is configured.
//
// Likes: one per visitor per song per day. A visitor is an anonymous random
// id the browser keeps (sent as the x-pulse-visitor header). Clearing it
// doesn't help much: each network address can add at most IP_DAILY_CAP likes
// per song per day. Neither the visitor id nor the address is stored as-is,
// only salted hashes that include the date, so they can't be followed from
// one day to the next. Marks older than two days are deleted by the cleanup cron.
//
// Comments: signed-in users only; the author's display name and picture
// (from their Google/Apple account) are shown next to the comment.
import { createHash } from 'node:crypto';
import { hasDb, query } from './db.js';

export const IP_DAILY_CAP = 5;
export const COMMENT_MAX = 500;
const COMMENT_GAP_MS = 10_000;     // at most one comment every 10 s per user
const COMMENTS_PER_DAY = 30;       // per user, across all songs
const LIST_LIMIT = 100;

const SALT = process.env.PULSE_HASH_SALT || 'pulsepic-likes-v1';
const today = () => new Date().toISOString().slice(0, 10);
const hash = (...parts) => createHash('sha256').update([SALT, ...parts].join('|')).digest('hex').slice(0, 32);

export function socialMode() {
  if (hasDb()) return 'postgres';
  if (process.env.PULSE_LOCAL_STORAGE) return 'memory';
  return 'none';
}

export function visitorOf(request) {
  const v = request.headers.get('x-pulse-visitor') || '';
  return /^[\w-]{8,64}$/.test(v) ? v : null;
}

export function ipOf(request) {
  const fwd = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  return fwd || request.headers.get('x-real-ip') || 'unknown';
}

// ── memory store (local dev only) ──
const mem = { likes: new Map(), marks: new Set(), ips: new Map(), comments: [], nextId: 1 };

// ───────────────────────────── likes ─────────────────────────────

export async function getLikes(id, visitor) {
  const day = today();
  const v = visitor ? hash('v', day, id, visitor) : null;
  if (socialMode() === 'memory') return { likes: mem.likes.get(id) || 0, likedToday: !!v && mem.marks.has(`${id}|${day}|${v}`) };
  const [c, m] = await Promise.all([
    query('SELECT count FROM likes WHERE share_id = $1', [id]),
    v ? query('SELECT 1 FROM like_marks WHERE share_id = $1 AND day = $2 AND visitor = $3', [id, day, v]) : [],
  ]);
  return { likes: c.length ? Number(c[0].count) : 0, likedToday: m.length > 0 };
}

// { ok: true, likes } | { ok: false, reason: 'already' | 'limit', likes }
export async function addLike(id, visitor, ip) {
  const day = today();
  const v = hash('v', day, id, visitor);
  const ipKey = hash('ip', day, id, ip);
  if (socialMode() === 'memory') {
    const key = `${id}|${day}|${v}`;
    if (mem.marks.has(key)) return { ok: false, reason: 'already', likes: mem.likes.get(id) || 0 };
    const n = (mem.ips.get(`${id}|${day}|${ipKey}`) || 0) + 1;
    if (n > IP_DAILY_CAP) return { ok: false, reason: 'limit', likes: mem.likes.get(id) || 0 };
    mem.ips.set(`${id}|${day}|${ipKey}`, n);
    mem.marks.add(key);
    const likes = (mem.likes.get(id) || 0) + 1;
    mem.likes.set(id, likes);
    return { ok: true, likes };
  }
  const current = async () => {
    const r = await query('SELECT count FROM likes WHERE share_id = $1', [id]);
    return r.length ? Number(r[0].count) : 0;
  };
  const seen = await query('SELECT 1 FROM like_marks WHERE share_id = $1 AND day = $2 AND visitor = $3', [id, day, v]);
  if (seen.length) return { ok: false, reason: 'already', likes: await current() };
  const ipRow = await query(
    `INSERT INTO like_ips (share_id, day, ip, n) VALUES ($1, $2, $3, 1)
     ON CONFLICT (share_id, day, ip) DO UPDATE SET n = like_ips.n + 1 RETURNING n`, [id, day, ipKey]);
  if (Number(ipRow[0].n) > IP_DAILY_CAP) return { ok: false, reason: 'limit', likes: await current() };
  const mark = await query(
    `INSERT INTO like_marks (share_id, day, visitor) VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING RETURNING 1`, [id, day, v]);
  if (!mark.length) return { ok: false, reason: 'already', likes: await current() };
  const r = await query(
    `INSERT INTO likes (share_id, count) VALUES ($1, 1)
     ON CONFLICT (share_id) DO UPDATE SET count = likes.count + 1, updated_at = now()
     RETURNING count`, [id]);
  return { ok: true, likes: Number(r[0].count) };
}

// ─────────────────────────── comments ───────────────────────────

export function cleanComment(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function countComments(id) {
  if (socialMode() === 'memory') return mem.comments.filter((c) => c.share_id === id).length;
  const r = await query('SELECT count(*)::int AS n FROM comments WHERE share_id = $1', [id]);
  return Number(r[0].n);
}

// Newest first. canDelete(row) decides the per-comment delete flag.
export async function listComments(id, canDelete) {
  let rows;
  if (socialMode() === 'memory') {
    rows = mem.comments.filter((c) => c.share_id === id).slice(-LIST_LIMIT).reverse();
  } else {
    rows = await query(
      `SELECT id, share_id, user_id, name, image_url, body, created_at FROM comments
       WHERE share_id = $1 ORDER BY created_at DESC, id DESC LIMIT ${LIST_LIMIT}`, [id]);
  }
  return rows.map((c) => ({
    id: String(c.id),
    name: c.name,
    image: c.image_url || null,
    body: c.body,
    at: new Date(c.created_at).toISOString(),
    canDelete: !!canDelete(c),
  }));
}

// { ok: true, comment } | { ok: false, error, status }
export async function addComment(id, user, body) {
  const name = (user.name || 'PulsePic listener').slice(0, 60);
  const image = user.imageUrl && /^https:\/\//.test(user.imageUrl) ? user.imageUrl.slice(0, 500) : null;
  if (socialMode() === 'memory') {
    const mine = mem.comments.filter((c) => c.user_id === user.userId);
    const last = mine[mine.length - 1];
    if (last && Date.now() - new Date(last.created_at) < COMMENT_GAP_MS) return { ok: false, status: 429, error: 'Slow down a little, then try again.' };
    if (mine.filter((c) => Date.now() - new Date(c.created_at) < 864e5).length >= COMMENTS_PER_DAY) return { ok: false, status: 429, error: 'That’s a lot of comments for one day. Try again tomorrow.' };
    const c = { id: mem.nextId++, share_id: id, user_id: user.userId, name, image_url: image, body, created_at: new Date().toISOString() };
    mem.comments.push(c);
    return { ok: true, comment: c };
  }
  const recent = await query(
    `SELECT count(*)::int AS day,
            count(*) FILTER (WHERE created_at > now() - interval '10 seconds')::int AS burst
     FROM comments WHERE user_id = $1 AND created_at > now() - interval '1 day'`, [user.userId]);
  if (recent[0].burst > 0) return { ok: false, status: 429, error: 'Slow down a little, then try again.' };
  if (recent[0].day >= COMMENTS_PER_DAY) return { ok: false, status: 429, error: 'That’s a lot of comments for one day. Try again tomorrow.' };
  const r = await query(
    `INSERT INTO comments (share_id, user_id, name, image_url, body) VALUES ($1, $2, $3, $4, $5)
     RETURNING id, share_id, user_id, name, image_url, body, created_at`, [id, user.userId, name, image, body]);
  return { ok: true, comment: r[0] };
}

export async function getComment(commentId) {
  if (socialMode() === 'memory') return mem.comments.find((c) => String(c.id) === String(commentId)) || null;
  const r = await query('SELECT id, share_id, user_id FROM comments WHERE id = $1', [commentId]);
  return r[0] || null;
}

export async function deleteComment(commentId) {
  if (socialMode() === 'memory') { mem.comments = mem.comments.filter((c) => String(c.id) !== String(commentId)); return; }
  await query('DELETE FROM comments WHERE id = $1', [commentId]);
}

// ─────────────────────────── housekeeping ───────────────────────────

// Everything for a share (when the share is deleted).
export async function deleteSocial(id) {
  if (socialMode() === 'memory') {
    mem.likes.delete(id);
    mem.comments = mem.comments.filter((c) => c.share_id !== id);
    return;
  }
  if (socialMode() !== 'postgres') return;
  await query('DELETE FROM likes WHERE share_id = $1', [id]);
  await query('DELETE FROM like_marks WHERE share_id = $1', [id]);
  await query('DELETE FROM like_ips WHERE share_id = $1', [id]);
  await query('DELETE FROM comments WHERE share_id = $1', [id]);
}

// Daily: like marks are only needed for "today", keep two days for time zones.
export async function pruneLikeMarks() {
  if (socialMode() !== 'postgres') return 0;
  const a = await query("DELETE FROM like_marks WHERE day < (now() - interval '2 days')::date RETURNING 1");
  await query("DELETE FROM like_ips WHERE day < (now() - interval '2 days')::date");
  return a.length;
}

// { id: { likes, comments } } for the admin songs list.
export async function socialCounts(ids) {
  const out = Object.fromEntries(ids.map((id) => [id, { likes: 0, comments: 0 }]));
  if (!ids.length || socialMode() === 'none') return out;
  if (socialMode() === 'memory') {
    for (const id of ids) out[id] = { likes: mem.likes.get(id) || 0, comments: mem.comments.filter((c) => c.share_id === id).length };
    return out;
  }
  const [l, c] = await Promise.all([
    query('SELECT share_id, count FROM likes WHERE share_id = ANY($1)', [ids]),
    query('SELECT share_id, count(*)::int AS n FROM comments WHERE share_id = ANY($1) GROUP BY share_id', [ids]),
  ]);
  for (const r of l) out[r.share_id].likes = Number(r.count);
  for (const r of c) out[r.share_id].comments = Number(r.n);
  return out;
}
