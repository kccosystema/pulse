// Play counts ("jams"). Uses Upstash Redis over its REST API (the store
// Vercel's Storage tab connects), so increments are atomic. Env vars:
// KV_REST_API_URL / KV_REST_API_TOKEN (Vercel's names) or
// UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.
// The local dev server keeps counts in memory.

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const mem = new Map();

export function counterMode() {
  if (URL_ && TOKEN) return 'redis';
  if (process.env.PULSE_LOCAL_STORAGE) return 'memory';
  return 'none';
}

const key = (id) => `plays:${id}`;

async function redis(cmd) {
  const res = await fetch(URL_, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  const out = await res.json();
  if (out.error) throw new Error(out.error);
  return out.result;
}

export async function addPlay(id) {
  if (counterMode() === 'memory') { const n = (mem.get(id) || 0) + 1; mem.set(id, n); return n; }
  return Number(await redis(['INCR', key(id)]));
}

// { id: count } for many ids at once.
export async function getPlays(ids) {
  if (!ids.length) return {};
  if (counterMode() === 'memory') return Object.fromEntries(ids.map((id) => [id, mem.get(id) || 0]));
  const vals = await redis(['MGET', ...ids.map(key)]);
  return Object.fromEntries(ids.map((id, i) => [id, Number(vals[i]) || 0]));
}

export async function deletePlays(id) {
  if (counterMode() === 'memory') { mem.delete(id); return; }
  if (counterMode() === 'redis') await redis(['DEL', key(id)]);
}
