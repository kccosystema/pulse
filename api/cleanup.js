// Daily job (vercel.json "crons"): deletes guest links older than 30 days,
// with their cover and song. Only ever removes expired, unclaimed shares, so
// running it extra times is harmless. If CRON_SECRET is set, Vercel's cron
// sends it and other callers are refused.
import { cleanupExpired } from '../lib/shares.js';
import { blobAuth, storageMode } from '../lib/storage.js';
import { json } from '../lib/http.js';

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) return json({ error: 'Forbidden' }, 403);
  if (storageMode() === 'none') return json({ skipped: 'no storage' });
  const result = await cleanupExpired(blobAuth(request));
  console.log('cleanup', result);
  return json(result);
}
