// Share bookkeeping shared by the API routes.
//   shares/<id>.json            the share (manifest)
//   owners/<userId>/<id>.json   a signed-in user's list of links
//   expiry/<YYYY-MM-DD>/<id>    guest links due for deletion on that day
import { createHash, randomBytes } from 'node:crypto';
import { putJSON, getJSON, listPaths, deletePaths } from './storage.js';
import { deletePlays } from './counter.js';
import { deleteSocial } from './social.js';

export const GUEST_DAYS = 30;
export const isShareId = (id) => typeof id === 'string' && /^[A-Za-z0-9]{6,24}$/.test(id);
const safeUser = (userId) => String(userId).replace(/[^\w-]/g, '_').slice(0, 80);

export const newClaimToken = () => randomBytes(24).toString('base64url');
export const hashToken = (t) => createHash('sha256').update(String(t)).digest('hex');

export const sharePath = (id) => `shares/${id}.json`;
export const ownerIndexPath = (userId, id) => `owners/${safeUser(userId)}/${id}.json`;
const expiryPath = (iso, id) => `expiry/${iso.slice(0, 10)}/${id}`;

export function isExpired(m, now = Date.now()) {
  return !!(m && m.expiresAt && Date.parse(m.expiresAt) <= now);
}

export async function saveNewShare(manifest, auth) {
  await putJSON(sharePath(manifest.id), manifest, auth);
  if (manifest.owner) await putJSON(ownerIndexPath(manifest.owner, manifest.id), indexEntry(manifest), auth, { overwrite: true });
  if (manifest.expiresAt) await putJSON(expiryPath(manifest.expiresAt, manifest.id), {}, auth, { overwrite: true });
}

export function indexEntry(m) {
  return { id: m.id, title: m.title, artist: m.artist, album: m.album, image: m.image.url, createdAt: m.createdAt };
}

// Attach a guest share to a signed-in user (needs the secret claim token
// that was given to the browser that created it). Returns true on success.
export async function claimShare(id, token, userId, auth) {
  if (!isShareId(id) || typeof token !== 'string') return false;
  const m = await getJSON(sharePath(id), auth);
  if (!m || isExpired(m)) return false;
  if (m.owner) return m.owner === userId;
  if (!m.claimHash || m.claimHash !== hashToken(token)) return false;
  const oldExpiry = m.expiresAt;
  m.owner = userId;
  m.expiresAt = null;
  m.claimHash = null;
  await putJSON(sharePath(id), m, auth, { overwrite: true });
  await putJSON(ownerIndexPath(userId, id), indexEntry(m), auth, { overwrite: true });
  if (oldExpiry) await deletePaths([expiryPath(oldExpiry, id)], auth).catch(() => {});
  return true;
}

export async function listUserShares(userId, auth) {
  const items = await listPaths(`owners/${safeUser(userId)}/`, auth);
  const entries = await Promise.all(items.map((it) => fetchJSON(it, auth)));
  return entries.filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function fetchJSON(item, auth) {
  return getJSON(item.pathname, auth).catch(() => null);
}

// Delete a share and everything it uploaded.
export async function deleteShare(m, auth) {
  await deletePaths([m.image?.url, m.audio?.url, ...(m.images || []).map((x) => x.url)], auth).catch((e) => console.error('media delete failed', e));
  const extra = [sharePath(m.id)];
  if (m.owner) extra.push(ownerIndexPath(m.owner, m.id));
  if (m.expiresAt) extra.push(expiryPath(m.expiresAt, m.id));
  await deletePaths(extra, auth);
  await deletePlays(m.id).catch(() => {});
  await deleteSocial(m.id).catch((e) => console.error('social delete failed', e));
}

// Daily job: remove guest shares whose 30 days are up.
export async function cleanupExpired(auth, now = Date.now()) {
  const today = new Date(now).toISOString().slice(0, 10);
  const markers = await listPaths('expiry/', auth);
  let deleted = 0, kept = 0;
  for (const mk of markers) {
    const [, day, id] = mk.pathname.split('/');
    if (!day || day > today) continue;
    const m = isShareId(id) ? await getJSON(sharePath(id), auth).catch(() => null) : null;
    if (m && !m.owner && isExpired(m, now)) {
      await deleteShare(m, auth);
      deleted++;
    } else if (m && !m.owner && !isExpired(m, now)) {
      kept++; // due later today
      continue;
    } else {
      await deletePaths([mk.pathname], auth); // claimed or already gone
    }
  }
  return { deleted, kept, checked: markers.length };
}
