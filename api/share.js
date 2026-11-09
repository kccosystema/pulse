// Saves a share: validated song details + effect settings + beat timeline,
// pointing at a cover and song already uploaded to our store.
import { isOurMediaUrl, storageMode, blobAuth } from '../lib/storage.js';
import { getUser } from '../lib/auth.js';
import { saveNewShare, newClaimToken, hashToken, GUEST_DAYS } from '../lib/shares.js';
import { json } from '../lib/http.js';

const FX = ['glow', 'shake', 'flash', 'tilt', 'bounce', 'echo', 'rings', 'sparks', 'rgb', 'bars', 'strobe', 'round'];
const MAX_BODY = 1.5 * 1024 * 1024;

const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');
const num = (v, lo, hi, dflt) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt);

function website(v) {
  const s = str(v, 300);
  if (!s) return '';
  try {
    const u = new URL(s);
    return /^https?:$/.test(u.protocol) ? u.href : '';
  } catch {
    return '';
  }
}

function events(list, width, max) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, max)
    .filter((e) => Array.isArray(e) && e.length >= width && e.slice(0, width).every((x) => typeof x === 'number' && Number.isFinite(x)))
    .map((e) => e.slice(0, width).map((x) => Math.round(x * 1000) / 1000));
}

function randomId(n = 10) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(bytes, (b) => abc[b % abc.length]).join('');
}

export async function POST(request) {
  if (storageMode() === 'none') return json({ error: 'Sharing storage is not set up' }, 503);
  const text = await request.text();
  if (text.length > MAX_BODY) return json({ error: 'Too much data' }, 413);
  let m;
  try { m = JSON.parse(text); } catch { return json({ error: 'Bad request' }, 400); }

  const title = str(m.title, 120);
  const artist = str(m.artist, 120);
  if (!title || !artist) return json({ error: 'Song name and artist are required' }, 400);
  if (!isOurMediaUrl(m.image?.url) || !isOurMediaUrl(m.audio?.url)) return json({ error: 'Upload the files first' }, 400);

  const s = m.settings || {};
  const fx = {};
  for (const k of FX) if (s.fx && s.fx[k] === true) fx[k] = true;
  const a = m.analysis;

  // Signed in → the link is theirs and never expires. Guest → it expires in
  // 30 days unless claimed later with the secret claim token returned below.
  const user = await getUser(request);
  const claimToken = user ? null : newClaimToken();
  const id = randomId();
  const manifest = {
    v: 1,
    id,
    createdAt: new Date().toISOString(),
    owner: user ? user.userId : null,
    expiresAt: user ? null : new Date(Date.now() + GUEST_DAYS * 86400e3).toISOString(),
    claimHash: claimToken ? hashToken(claimToken) : null,
    title,
    artist,
    album: str(m.album, 120),
    website: website(m.website),
    image: { url: m.image.url, width: num(m.image.width, 1, 10000, 1000), height: num(m.image.height, 1, 10000, 1000) },
    audio: {
      url: m.audio.url,
      type: str(m.audio.type, 40) || 'audio/mpeg',
      duration: num(m.audio.duration, 0, 7200, null),
      delay: num(m.audio.delay, 0, 0.5, 0),
    },
    settings: {
      fx,
      intensity: num(s.intensity, 0, 1, 0.45),
      sensitivity: num(s.sensitivity, 0, 1, 0.55),
      mode: ['beat', 'kick', 'hits'].includes(s.mode) ? s.mode : 'beat',
    },
    analysis: a && typeof a === 'object' ? {
      bpm: num(a.bpm, 30, 300, 120),
      beats: events(a.beats, 3, 20000),
      kicks: events(a.kicks, 2, 40000),
      hits: events(a.hits, 2, 60000),
    } : null,
  };

  try {
    await saveNewShare(manifest, blobAuth(request));
  } catch (err) {
    console.error('share save failed', err);
    return json({ error: 'Could not save the share. Try again.' }, 500);
  }
  const origin = new URL(request.url).origin;
  return json({ id, url: `${origin}/s/${id}`, expiresAt: manifest.expiresAt, claimToken }, 201);
}
