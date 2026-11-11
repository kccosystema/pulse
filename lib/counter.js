// Play counts ("jams"): Postgres (lib/db.js) in production, in-memory on the
// local dev server when no database is configured.
import { hasDb, query } from './db.js';

const mem = new Map();      // real plays (memory mode)
const memSeed = new Map();  // admin-set extra (memory mode)
const shown = (id) => Math.max(0, (mem.get(id) || 0) + (memSeed.get(id) || 0));

export function counterMode() {
  if (hasDb()) return 'postgres';
  if (process.env.PULSE_LOCAL_STORAGE) return 'memory';
  return 'none';
}

export async function addPlay(id) {
  if (counterMode() === 'memory') { mem.set(id, (mem.get(id) || 0) + 1); return shown(id); }
  const rows = await query(
    `INSERT INTO plays (share_id, count) VALUES ($1, 1)
     ON CONFLICT (share_id) DO UPDATE SET count = plays.count + 1, updated_at = now()
     RETURNING GREATEST(0, count + seed) AS shown`, [id]);
  return Number(rows[0].shown);
}

// { id: count } for many ids at once: the number shown on share pages
// (real plays plus any admin-set extra).
export async function getPlays(ids) {
  const out = Object.fromEntries(ids.map((id) => [id, 0]));
  if (!ids.length) return out;
  if (counterMode() === 'memory') { for (const id of ids) out[id] = shown(id); return out; }
  const rows = await query('SELECT share_id, GREATEST(0, count + seed) AS n FROM plays WHERE share_id = ANY($1)', [ids]);
  for (const r of rows) out[r.share_id] = Number(r.n);
  return out;
}

// { id: count } of real plays only (for analytics).
export async function getRealPlays(ids) {
  const out = Object.fromEntries(ids.map((id) => [id, 0]));
  if (!ids.length) return out;
  if (counterMode() === 'memory') { for (const id of ids) out[id] = mem.get(id) || 0; return out; }
  const rows = await query('SELECT share_id, count FROM plays WHERE share_id = ANY($1)', [ids]);
  for (const r of rows) out[r.share_id] = Number(r.count);
  return out;
}

export async function deletePlays(id) {
  if (counterMode() === 'memory') { mem.delete(id); memSeed.delete(id); return; }
  if (counterMode() === 'postgres') await query('DELETE FROM plays WHERE share_id = $1', [id]);
}

// Admin: make the shown play count exactly n. Real plays are untouched; the
// difference goes in "seed" (so later real plays still add on top).
export async function setPlays(id, n) {
  if (counterMode() === 'memory') { memSeed.set(id, n - (mem.get(id) || 0)); return shown(id); }
  const rows = await query(
    `INSERT INTO plays (share_id, count, seed) VALUES ($1, 0, $2)
     ON CONFLICT (share_id) DO UPDATE SET seed = $2 - plays.count, updated_at = now()
     RETURNING GREATEST(0, count + seed) AS shown`, [id, n]);
  return Number(rows[0].shown);
}
