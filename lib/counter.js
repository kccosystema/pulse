// Play counts ("jams"), stored atomically in one of:
//   postgres – Neon Postgres (DATABASE_URL / POSTGRES_URL from Vercel's Neon
//              integration), via Neon's HTTP driver. Table created on first use.
//   redis    – Upstash Redis REST (KV_REST_API_URL / KV_REST_API_TOKEN, or the
//              UPSTASH_REDIS_REST_* names).
//   memory   – local dev server only.
import { neon } from '@neondatabase/serverless';

const PG_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const mem = new Map();

export function counterMode() {
  if (PG_URL) return 'postgres';
  if (REDIS_URL && REDIS_TOKEN) return 'redis';
  if (process.env.PULSE_LOCAL_STORAGE) return 'memory';
  return 'none';
}

// ── Postgres ──
let sql = null, ready = null;
function pg() {
  sql ||= neon(PG_URL);
  ready ||= sql`CREATE TABLE IF NOT EXISTS plays (
      share_id text PRIMARY KEY,
      count bigint NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`.catch((e) => { ready = null; throw e; });
  return ready.then(() => sql);
}

// ── Redis ──
async function redis(cmd) {
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${REDIS_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  const out = await res.json();
  if (out.error) throw new Error(out.error);
  return out.result;
}
const rkey = (id) => `plays:${id}`;

export async function addPlay(id) {
  switch (counterMode()) {
    case 'postgres': {
      const q = await pg();
      const rows = await q`INSERT INTO plays (share_id, count) VALUES (${id}, 1)
        ON CONFLICT (share_id) DO UPDATE SET count = plays.count + 1, updated_at = now()
        RETURNING count`;
      return Number(rows[0].count);
    }
    case 'redis': return Number(await redis(['INCR', rkey(id)]));
    case 'memory': { const n = (mem.get(id) || 0) + 1; mem.set(id, n); return n; }
    default: return 0;
  }
}

// { id: count } for many ids at once.
export async function getPlays(ids) {
  if (!ids.length) return {};
  const out = Object.fromEntries(ids.map((id) => [id, 0]));
  switch (counterMode()) {
    case 'postgres': {
      const q = await pg();
      const rows = await q`SELECT share_id, count FROM plays WHERE share_id = ANY(${ids})`;
      for (const r of rows) out[r.share_id] = Number(r.count);
      return out;
    }
    case 'redis': {
      const vals = await redis(['MGET', ...ids.map(rkey)]);
      ids.forEach((id, i) => { out[id] = Number(vals[i]) || 0; });
      return out;
    }
    case 'memory':
      for (const id of ids) out[id] = mem.get(id) || 0;
      return out;
    default: return out;
  }
}

export async function deletePlays(id) {
  switch (counterMode()) {
    case 'postgres': { const q = await pg(); await q`DELETE FROM plays WHERE share_id = ${id}`; return; }
    case 'redis': await redis(['DEL', rkey(id)]); return;
    case 'memory': mem.delete(id); return;
    default:
  }
}
