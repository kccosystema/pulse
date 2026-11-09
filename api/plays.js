// Play counts. POST ?id=  counts one play (the share page sends it once a
// listener has heard 5 s, at most once per browser per day) and returns the
// new total. GET ?id= or ?ids=a,b,c returns totals.
import { counterMode, addPlay, getPlays } from '../lib/counter.js';
import { isShareId } from '../lib/shares.js';
import { json } from '../lib/http.js';

export async function GET(request) {
  if (counterMode() === 'none') return json({ enabled: false, plays: {} });
  const q = new URL(request.url).searchParams;
  const ids = (q.get('ids') || q.get('id') || '').split(',').filter(isShareId).slice(0, 100);
  try {
    return json({ enabled: true, plays: await getPlays(ids) });
  } catch (err) {
    console.error('plays read failed', err);
    return json({ enabled: false, plays: {} });
  }
}

export async function POST(request) {
  if (counterMode() === 'none') return json({ enabled: false });
  const id = new URL(request.url).searchParams.get('id');
  if (!isShareId(id)) return json({ error: 'Bad request' }, 400);
  try {
    return json({ enabled: true, plays: await addPlay(id) });
  } catch (err) {
    console.error('play count failed', err);
    return json({ enabled: false }, 200);
  }
}
