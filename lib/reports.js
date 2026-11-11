// Reports from share pages ("this is my music", offensive, spam…), reviewed
// in admin → Reports. Postgres in production, memory on the dev server.
import { createHash } from 'node:crypto';
import { hasDb, query } from './db.js';

export const REASONS = { copyright: 'Uses my music or art without permission', offensive: 'Offensive or inappropriate', spam: 'Spam or misleading', other: 'Something else' };
const PER_DAY = 5; // per network address
const SALT = process.env.PULSE_HASH_SALT || 'pulsepic-likes-v1';
const mem = { rows: [], next: 1 };
const memMode = () => !hasDb() && !!process.env.PULSE_LOCAL_STORAGE;
export const reportsEnabled = () => hasDb() || memMode();
const day = () => new Date().toISOString().slice(0, 10);
const ipKey = (ip) => createHash('sha256').update([SALT, 'report', day(), ip].join('|')).digest('hex').slice(0, 32);
const str = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max) : '');

export function cleanReport(b) {
  const reason = b && Object.hasOwn(REASONS, b.reason) ? b.reason : null;
  if (!reason) return { error: 'Pick a reason' };
  const details = str(b.details, 2000);
  const contact = str(b.contact, 200);
  if (reason === 'copyright' && !details) return { error: 'Tell us which work is yours so we can check it' };
  if (contact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return { error: 'That email doesn’t look right' };
  return { reason, details, contact };
}

// { ok } | { error, status }
export async function addReport(shareId, r, ip) {
  const k = ipKey(ip);
  if (memMode()) {
    if (mem.rows.filter((x) => x.ip_hash === k).length >= PER_DAY) return { error: 'Too many reports today. Try again tomorrow.', status: 429 };
    mem.rows.push({ id: mem.next++, share_id: shareId, ...r, ip_hash: k, status: 'open', created_at: new Date().toISOString() });
    return { ok: true };
  }
  const [{ n }] = await query("SELECT count(*)::int AS n FROM reports WHERE ip_hash = $1 AND created_at > now() - interval '1 day'", [k]);
  if (n >= PER_DAY) return { error: 'Too many reports today. Try again tomorrow.', status: 429 };
  await query('INSERT INTO reports (share_id, reason, details, contact, ip_hash) VALUES ($1, $2, $3, $4, $5)',
    [shareId, r.reason, r.details, r.contact || null, k]);
  return { ok: true };
}

export async function listReports() {
  const shape = (x) => ({ id: String(x.id), shareId: x.share_id, reason: x.reason, reasonText: REASONS[x.reason] || x.reason,
    details: x.details || '', contact: x.contact || '', status: x.status, at: new Date(x.created_at).toISOString() });
  if (memMode()) return mem.rows.slice().reverse().map(shape);
  const rows = await query(`SELECT id, share_id, reason, details, contact, status, created_at FROM reports
    ORDER BY (status = 'open') DESC, created_at DESC LIMIT 200`);
  return rows.map(shape);
}

export async function setReportStatus(id, status) {
  if (memMode()) { const r = mem.rows.find((x) => String(x.id) === String(id)); if (r) r.status = status; return; }
  await query('UPDATE reports SET status = $2 WHERE id = $1', [id, status]);
}

export async function openReportCount() {
  if (memMode()) return mem.rows.filter((x) => x.status === 'open').length;
  const [{ n }] = await query("SELECT count(*)::int AS n FROM reports WHERE status = 'open'");
  return n;
}
