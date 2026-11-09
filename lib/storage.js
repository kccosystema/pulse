// Where shared pictures, songs and share pages are stored.
//   blob  – Vercel Blob (production; needs a Blob store connected to the project)
//   local – files under PULSE_LOCAL_STORAGE (scripts/dev.mjs only)
//   none  – sharing disabled
import { put, head, BlobNotFoundError } from '@vercel/blob';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const LOCAL_DIR = process.env.PULSE_LOCAL_STORAGE || '';

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

export async function putJSON(pathname, data) {
  const body = JSON.stringify(data);
  if (storageMode() === 'local') {
    const file = path.join(LOCAL_DIR, pathname);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body, { flag: 'wx' });
    return;
  }
  await put(pathname, body, {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  });
}

export async function getJSON(pathname) {
  if (storageMode() === 'local') {
    try { return JSON.parse(await readFile(path.join(LOCAL_DIR, pathname), 'utf8')); }
    catch { return null; }
  }
  try {
    const meta = await head(pathname);
    const res = await fetch(meta.url);
    return res.ok ? await res.json() : null;
  } catch (err) {
    if (err instanceof BlobNotFoundError) return null;
    throw err;
  }
}
