// Page-level events sent by the browser: home_view, share_view, export.
import { track, CLIENT_EVENTS } from '../lib/analytics.js';
import { isShareId } from '../lib/shares.js';
import { json } from '../lib/http.js';

export async function POST(request) {
  let b = {};
  try { b = await request.json(); } catch {}
  if (!CLIENT_EVENTS.includes(b.type)) return json({ ok: false }, 400);
  await track(b.type, request, { shareId: isShareId(b.id) ? b.id : null });
  return json({ ok: true });
}
