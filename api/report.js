// POST ?id= {reason, details, contact}: report a share page. Anyone can
// report; limited per network address. Reviewed in admin → Reports.
import { reportsEnabled, cleanReport, addReport } from '../lib/reports.js';
import { ipOf } from '../lib/social.js';
import { isShareId, sharePath } from '../lib/shares.js';
import { getJSON, blobAuth } from '../lib/storage.js';
import { json } from '../lib/http.js';

export async function POST(request) {
  if (!reportsEnabled()) return json({ error: 'Reporting isn’t available right now' }, 503);
  const id = new URL(request.url).searchParams.get('id');
  if (!isShareId(id)) return json({ error: 'Bad request' }, 400);
  const t = await request.text();
  if (t.length > 8 * 1024) return json({ error: 'Too long' }, 413);
  let b; try { b = JSON.parse(t); } catch { return json({ error: 'Bad request' }, 400); }
  const r = cleanReport(b);
  if (r.error) return json({ error: r.error }, 400);
  const m = await getJSON(sharePath(id), blobAuth(request)).catch(() => null);
  if (!m) return json({ error: 'Not found' }, 404);
  const out = await addReport(id, r, ipOf(request));
  if (out.error) return json({ error: out.error }, out.status);
  console.log('report', id, r.reason);
  return json({ ok: true });
}
