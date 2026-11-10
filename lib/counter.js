// Play counts ("jams"): Postgres (lib/db.js) in production, in-memory on the
// local dev server when no database is configured.
import { hasDb, query } from './db.js';

const mem = new Map();

export function counterMode() {
  if (hasDb()) return 'postgres';
  if (process.env.PULSE_LOCAL_STORAGE) return 'memory';
  return 'none';
}

export async function addPlay(id) {
  if (counterMode() === 'memory') { const n = (mem.get(id) || 0) + 1; mem.set(id, n); return n; }
  const rows = await query(
    `INSERT INTO plays (share_id, count) VALUES ($1, 1)
     ON CONFLICT (share_id) DO UPDATE SET count = plays.count + 1, updated_at = now()
     RETURNING count`, [id]);
  return Number(rows[0].count);
}

// { id: count } for many ids at once.
export async function getPlays(ids) {
  const out = Object.fromEntries(ids.map((id) => [id, 0]));
  if (!ids.length) return out;
  if (counterMode() === 'memory') { for (const id of ids) out[id] = mem.get(id) || 0; return out; }
  const rows = await query('SELECT share_id, count FROM plays WHERE share_id = ANY($1)', [ids]);
  for (const r of rows) out[r.share_id] = Number(r.count);
  return out;
}

export async function deletePlays(id) {
  if (counterMode() === 'memory') { mem.delete(id); return; }
  if (counterMode() === 'postgres') await query('DELETE FROM plays WHERE share_id = $1', [id]);
}
