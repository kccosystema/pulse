// Saved artist profiles (signed-in users): name, website and streaming links,
// picked from a dropdown in Song details. Postgres in production, memory on
// the local dev server.
import { hasDb, query } from './db.js';
import { cleanLinks } from './stream-links.js';

export const MAX_ARTISTS = 50;
const mem = { rows: [], next: 1 };
const memMode = () => !hasDb() && !!process.env.PULSE_LOCAL_STORAGE;
export const artistsEnabled = () => hasDb() || memMode();

const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');
function site(v) {
  const s = str(v, 300);
  if (!s) return '';
  try { const u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u.href : ''; } catch { return ''; }
}

// Validated fields, or { error }.
export function cleanArtist(b) {
  const name = str(b && b.name, 120);
  if (!name) return { error: 'Add the artist name' };
  return { name, website: site(b.website), links: cleanLinks(b.links) };
}

const shape = (r) => ({ id: String(r.id), name: r.name, website: r.website || '', links: r.links || {} });

export async function listArtists(userId) {
  if (memMode()) return mem.rows.filter((r) => r.user_id === userId).sort((a, b) => a.name.localeCompare(b.name)).map(shape);
  const rows = await query('SELECT id, name, website, links FROM artists WHERE user_id = $1 ORDER BY lower(name)', [userId]);
  return rows.map(shape);
}

export async function createArtist(userId, a) {
  if (memMode()) {
    if (mem.rows.filter((r) => r.user_id === userId).length >= MAX_ARTISTS) return { error: `Up to ${MAX_ARTISTS} artists` };
    const r = { id: mem.next++, user_id: userId, ...a };
    mem.rows.push(r);
    return { artist: shape(r) };
  }
  const [{ n }] = await query('SELECT count(*)::int AS n FROM artists WHERE user_id = $1', [userId]);
  if (n >= MAX_ARTISTS) return { error: `Up to ${MAX_ARTISTS} artists` };
  const rows = await query(
    'INSERT INTO artists (user_id, name, website, links) VALUES ($1, $2, $3, $4) RETURNING id, name, website, links',
    [userId, a.name, a.website, JSON.stringify(a.links)]);
  return { artist: shape(rows[0]) };
}

export async function updateArtist(userId, id, a) {
  if (memMode()) {
    const r = mem.rows.find((x) => String(x.id) === String(id) && x.user_id === userId);
    if (!r) return null;
    Object.assign(r, a);
    return shape(r);
  }
  const rows = await query(
    `UPDATE artists SET name = $3, website = $4, links = $5, updated_at = now()
     WHERE id = $2 AND user_id = $1 RETURNING id, name, website, links`,
    [userId, id, a.name, a.website, JSON.stringify(a.links)]);
  return rows[0] ? shape(rows[0]) : null;
}

export async function deleteArtist(userId, id) {
  if (memMode()) { mem.rows = mem.rows.filter((x) => !(String(x.id) === String(id) && x.user_id === userId)); return; }
  await query('DELETE FROM artists WHERE id = $2 AND user_id = $1', [userId, id]);
}
