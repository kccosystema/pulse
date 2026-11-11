// Admin analytics: totals, a daily series per event type, top songs,
// countries and devices for the last N days (default 30). Only real activity:
// numbers the admin sets on their own songs are stored separately and left out.
import { requireAdmin, allShares } from './admin.js';
import { hasDb, query } from './db.js';
import { json } from './http.js';
import { openReportCount, reportsEnabled } from './reports.js';

export async function statsGET(request) {
  const a = await requireAdmin(request);
  if (a instanceof Response) return a;
  const days = Math.min(365, Math.max(1, Number(new URL(request.url).searchParams.get('days')) || 30));
  const shares = await allShares(a.auth);
  const byId = Object.fromEntries(shares.map((m) => [m.id, m]));
  const out = {
    days,
    db: hasDb(),
    totals: {
      songs: shares.length,
      memberSongs: shares.filter((m) => m.owner).length,
      guestSongs: shares.filter((m) => !m.owner).length,
      users: 0, plays: 0,
    },
    period: {}, series: [], topSongs: [], countries: [], devices: [],
  };
  out.openReports = reportsEnabled() ? await openReportCount().catch(() => 0) : 0;
  if (!hasDb()) return json(out);
  const since = `${days} days`;
  const [[u], [p], period, series, top, countries, devices] = await Promise.all([
    query('SELECT count(*)::int AS n FROM users'),
    // Real plays only: admin-set extras (plays.seed) are left out of analytics.
    query('SELECT COALESCE(sum(count), 0)::bigint AS n FROM plays'),
    query(`SELECT type, count(*)::int AS n FROM events WHERE created_at > now() - $1::interval GROUP BY type`, [since]),
    query(`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, type, count(*)::int AS n
           FROM events WHERE created_at > now() - $1::interval GROUP BY 1, 2 ORDER BY 1`, [since]),
    query('SELECT share_id, count::int AS n FROM plays WHERE count > 0 ORDER BY count DESC LIMIT 20'),
    query(`SELECT COALESCE(country, '??') AS country, count(*)::int AS n FROM events
           WHERE created_at > now() - $1::interval AND type IN ('home_view', 'share_view', 'play')
           GROUP BY 1 ORDER BY 2 DESC LIMIT 12`, [since]),
    query(`SELECT device, count(*)::int AS n FROM events
           WHERE created_at > now() - $1::interval AND type IN ('home_view', 'share_view') GROUP BY 1 ORDER BY 2 DESC`, [since]),
  ]);
  out.totals.users = u.n;
  out.totals.plays = Number(p.n);
  out.period = Object.fromEntries(period.map((r) => [r.type, r.n]));
  out.series = series;
  out.topSongs = top.filter((r) => byId[r.share_id]).slice(0, 10)
    .map((r) => ({ id: r.share_id, plays: r.n, title: byId[r.share_id].title, artist: byId[r.share_id].artist }));
  out.countries = countries;
  out.devices = devices;
  return json(out);
}
