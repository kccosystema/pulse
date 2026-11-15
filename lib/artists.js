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

export const BIO_MAX = 600;
const cleanBio = (v) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, BIO_MAX) : '');

// Validated fields, or { error }. bio/public only change when sent.
export function cleanArtist(b) {
  const name = str(b && b.name, 120);
  if (!name) return { error: 'Add the artist name' };
  const a = { name, website: site(b.website), links: cleanLinks(b.links) };
  if (b.bio !== undefined) a.bio = cleanBio(b.bio);
  if (b.public !== undefined) a.public = b.public === true;
  return a;
}

const shape = (r) => ({ id: String(r.id), name: r.name, website: r.website || '', links: r.links || {},
  public: !!r.public, slug: r.slug || null, bio: r.bio || '' });

// "Flick the Bean" -> "flick-the-bean" (made unique with -2, -3…).
export function slugify(name) {
  return String(name).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'artist';
}
async function freeSlug(name) {
  const base = slugify(name);
  for (let i = 1; i < 500; i++) {
    const s = i === 1 ? base : `${base}-${i}`;
    const taken = memMode() ? mem.rows.some((r) => r.slug === s) : (await query('SELECT 1 FROM artists WHERE slug = $1', [s])).length > 0;
    if (!taken) return s;
  }
  return `${base}-${Date.now().toString(36)}`;
}
export const isSlug = (s) => typeof s === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(s);

export async function listArtists(userId) {
  if (memMode()) return mem.rows.filter((r) => r.user_id === userId).sort((a, b) => a.name.localeCompare(b.name)).map(shape);
  const rows = await query('SELECT id, name, website, links, public, slug, bio FROM artists WHERE user_id = $1 ORDER BY lower(name)', [userId]);
  return rows.map(shape);
}

export async function createArtist(userId, a) {
  if (memMode()) {
    if (mem.rows.filter((r) => r.user_id === userId).length >= MAX_ARTISTS) return { error: `Up to ${MAX_ARTISTS} artists` };
    const r = { id: mem.next++, user_id: userId, public: false, slug: null, bio: '', ...a };
    if (r.public) r.slug = await freeSlug(r.name);
    mem.rows.push(r);
    return { artist: shape(r) };
  }
  const [{ n }] = await query('SELECT count(*)::int AS n FROM artists WHERE user_id = $1', [userId]);
  if (n >= MAX_ARTISTS) return { error: `Up to ${MAX_ARTISTS} artists` };
  const slug = a.public ? await freeSlug(a.name) : null;
  const rows = await query(
    'INSERT INTO artists (user_id, name, website, links, bio, public, slug) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, website, links, public, slug, bio',
    [userId, a.name, a.website, JSON.stringify(a.links), a.bio || '', !!a.public, slug]);
  return { artist: shape(rows[0]) };
}

export async function updateArtist(userId, id, a) {
  if (memMode()) {
    const r = mem.rows.find((x) => String(x.id) === String(id) && x.user_id === userId);
    if (!r) return null;
    Object.assign(r, a);
    if (r.public && !r.slug) r.slug = await freeSlug(r.name); // the page address stays the same once made
    return shape(r);
  }
  const cur = (await query('SELECT slug FROM artists WHERE id = $2 AND user_id = $1', [userId, id]))[0];
  if (!cur) return null;
  const slug = a.public && !cur.slug ? await freeSlug(a.name) : cur.slug;
  const rows = await query(
    `UPDATE artists SET name = $3, website = $4, links = $5,
       bio = COALESCE($6, bio), public = COALESCE($7, public), slug = $8, updated_at = now()
     WHERE id = $2 AND user_id = $1 RETURNING id, name, website, links, public, slug, bio`,
    [userId, id, a.name, a.website, JSON.stringify(a.links), a.bio ?? null, a.public ?? null, slug]);
  return rows[0] ? shape(rows[0]) : null;
}

// Public lookups (only artists whose page is switched on).
export async function publicArtistBySlug(slug) {
  if (!isSlug(slug)) return null;
  if (memMode()) { const r = mem.rows.find((x) => x.slug === slug && x.public); return r ? { ...shape(r), userId: r.user_id } : null; }
  const rows = await query('SELECT id, user_id, name, website, links, public, slug, bio FROM artists WHERE slug = $1 AND public', [slug]);
  return rows[0] ? { ...shape(rows[0]), userId: rows[0].user_id } : null;
}
// The public page for a song's artist: by saved-artist id, else by name.
export async function publicArtistFor(userId, artistId, name) {
  if (!userId || !artistsEnabled()) return null;
  const n = String(name || '').trim().toLowerCase();
  if (memMode()) {
    const r = mem.rows.find((x) => x.user_id === userId && x.public && (String(x.id) === String(artistId) || x.name.toLowerCase() === n));
    return r ? shape(r) : null;
  }
  const rows = await query(
    `SELECT id, name, website, links, public, slug, bio FROM artists
     WHERE user_id = $1 AND public AND (id::text = $2 OR lower(name) = $3) ORDER BY (id::text = $2) DESC LIMIT 1`,
    [userId, String(artistId || ''), n]);
  return rows[0] ? shape(rows[0]) : null;
}

export async function deleteArtist(userId, id) {
  if (memMode()) { mem.rows = mem.rows.filter((x) => !(String(x.id) === String(id) && x.user_id === userId)); return; }
  await query('DELETE FROM artists WHERE id = $2 AND user_id = $1', [userId, id]);
}
