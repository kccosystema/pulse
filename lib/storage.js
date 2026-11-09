// Where shared pictures, songs and share pages are stored.
//   blob  – Vercel Blob (production; needs a Blob store connected to the project)
//   local – files under PULSE_LOCAL_STORAGE (scripts/dev.mjs only)
//   none  – sharing disabled
import { put, head, list, del, issueSignedToken, BlobNotFoundError } from '@vercel/blob';
import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const LOCAL_DIR = process.env.PULSE_LOCAL_STORAGE || '';

// Credentials for Blob calls. Stores connected the newer way authenticate with
// the function's Vercel OIDC token (sent per request in x-vercel-oidc-token)
// plus BLOB_STORE_ID; older ones use BLOB_READ_WRITE_TOKEN (picked up by the SDK).
export function blobAuth(request) {
  const oidcToken = request?.headers?.get?.('x-vercel-oidc-token') || process.env.VERCEL_OIDC_TOKEN;
  if (process.env.BLOB_READ_WRITE_TOKEN || !oidcToken) return {};
  return { oidcToken, storeId: process.env.BLOB_STORE_ID };
}

export { issueSignedToken };

export function storageMode() {
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) return 'blob';
  if (LOCAL_DIR) return 'local';
  return 'none';
}

// Public host of this project's Blob store, from the read-write token
// (vercel_blob_rw_<storeId>_<secret>). Null if it can't be worked out.
function storeHost() {
  const t = process.env.BLOB_READ_WRITE_TOKEN || '';
  const id = t.split('_')[3] || process.env.BLOB_STORE_ID || '';
  const clean = id.replace(/^store_/, '').toLowerCase();
  return clean ? `${clean}.public.blob.vercel-storage.com` : null;
}

// Only accept media that lives in our own store.
export function isOurMediaUrl(u) {
  if (typeof u !== 'string' || u.length > 600) return false;
  if (storageMode() === 'local') return /^\/m\/media\/(img|audio)\/[\w.-]+$/.test(u);
  try {
    const url = new URL(u);
    if (url.protocol !== 'https:' || !/^\/media\/(img|audio)\//.test(url.pathname)) return false;
    const host = storeHost();
    return host ? url.hostname === host : url.hostname.endsWith('.public.blob.vercel-storage.com');
  } catch {
    return false;
  }
}

export async function putJSON(pathname, data, auth = {}, { overwrite = false } = {}) {
  const body = JSON.stringify(data);
  if (storageMode() === 'local') {
    const file = path.join(LOCAL_DIR, pathname);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body, { flag: overwrite ? 'w' : 'wx' });
    return;
  }
  await put(pathname, body, {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: overwrite,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
    ...auth,
  });
}

export async function getJSON(pathname, auth = {}) {
  if (storageMode() === 'local') {
    try { return JSON.parse(await readFile(path.join(LOCAL_DIR, pathname), 'utf8')); }
    catch { return null; }
  }
  try {
    const meta = await head(pathname, auth);
    const res = await fetch(meta.url);
    return res.ok ? await res.json() : null;
  } catch (err) {
    if (err instanceof BlobNotFoundError) return null;
    throw err;
  }
}

// All stored paths under a prefix: [{ pathname, url }].
export async function listPaths(prefix, auth = {}) {
  if (storageMode() === 'local') {
    const out = [];
    const walk = async (dir) => {
      let entries = [];
      try { entries = await readdir(path.join(LOCAL_DIR, dir), { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const rel = path.posix.join(dir, e.name);
        if (e.isDirectory()) await walk(rel);
        else if (rel.startsWith(prefix)) out.push({ pathname: rel, url: `/m/${rel}` });
      }
    };
    await walk(prefix.split('/').slice(0, -1).join('/') || '.');
    return out;
  }
  const out = [];
  let cursor;
  do {
    const page = await list({ prefix, cursor, limit: 1000, ...auth });
    for (const b of page.blobs) out.push({ pathname: b.pathname, url: b.url });
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

// Delete stored files by pathname or public URL. Missing files are ignored.
export async function deletePaths(items, auth = {}) {
  const list = items.filter(Boolean);
  if (!list.length) return;
  if (storageMode() === 'local') {
    for (const it of list) {
      const rel = it.startsWith('/m/') ? it.slice(3) : it;
      await rm(path.join(LOCAL_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, '')), { force: true });
    }
    return;
  }
  await del(list, auth);
}
