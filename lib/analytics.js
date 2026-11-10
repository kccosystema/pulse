// Privacy-friendly event counting for the admin dashboard: an event type, an
// optional share/user id, the country (from Vercel's edge) and phone/desktop.
// No cookies, IPs or browser strings are stored. Failures never break a request.
import { hasDb, query } from './db.js';

export const CLIENT_EVENTS = ['home_view', 'share_view', 'export'];
export const ALL_EVENTS = [...CLIENT_EVENTS, 'play', 'share_created', 'signup'];

export function deviceOf(request) {
  const ua = request.headers.get('user-agent') || '';
  if (/bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|slack/i.test(ua)) return 'bot';
  return /Mobi|Android|iPhone|iPad|iPod/i.test(ua) ? 'mobile' : 'desktop';
}

export async function track(type, request, { shareId = null, userId = null } = {}) {
  if (!hasDb() || !ALL_EVENTS.includes(type)) return;
  const device = deviceOf(request);
  if (device === 'bot') return;
  const country = (request.headers.get('x-vercel-ip-country') || '').slice(0, 2).toUpperCase() || null;
  try {
    await query('INSERT INTO events (type, share_id, user_id, country, device) VALUES ($1, $2, $3, $4, $5)',
      [type, shareId, userId, country, device]);
  } catch (err) {
    console.error('track failed', type, err.message);
  }
}
