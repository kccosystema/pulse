// Accounts for the creator: Clerk sign-in (Google, Apple, …), the account
// button + "My links" sheet, claiming guest links after sign-in, and saving
// the work in progress across the sign-in redirect.
//
// Modes come from /api/config: "clerk" (production), "dev" (local dev server,
// fake sign-in) or "none" (accounts not set up; everyone is a guest).
'use strict';

const CLERK_JS_VERSION = '6.40.1';
// Clerk's sign-in screens ship separately (@clerk/ui) and must be handed to
// Clerk.load(); without them openSignIn() throws and nothing appears.
const CLERK_UI_VERSION = '1.41.2';

const account = {
  mode: 'none',
  user: null,      // { id, name, email, imageUrl }
  ready: false,
  config: null,
  listeners: [],
  onChange(fn) { this.listeners.push(fn); },
};

function notifyAccount(prev) {
  updateAccountButton();
  for (const fn of account.listeners) { try { fn(account.user, prev); } catch (e) { console.error(e); } }
  if (account.user && !prev) claimGuestLinks();
}

async function initAccount() {
  const cfg = await fetch('/api/config').then((r) => r.json()).catch(() => ({}));
  account.config = cfg;
  const a = cfg.auth || { mode: 'none' };
  account.mode = a.mode;
  if (a.mode === 'clerk') await loadClerk(a);
  else if (a.mode === 'dev') {
    const n = safeGet('pulse:devUser');
    account.user = n ? { id: `dev_${n}`, name: n, email: `${n}@dev.local`, imageUrl: null } : null;
  }
  account.ready = true;
  notifyAccount(null);
}

function loadScript(src, attrs = {}) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.crossOrigin = 'anonymous';
    Object.assign(s.dataset, attrs);
    s.onload = resolve;
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function loadClerk({ publishableKey, frontendApi }) {
  try {
    const base = `https://${frontendApi}/npm`;
    await Promise.all([
      loadScript(`${base}/@clerk/clerk-js@${CLERK_JS_VERSION}/dist/clerk.browser.js`, { clerkPublishableKey: publishableKey }),
      loadScript(`${base}/@clerk/ui@${CLERK_UI_VERSION}/dist/ui.browser.js`),
    ]);
    await window.Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
    account.user = clerkUser(window.Clerk.user);
    window.Clerk.addListener(({ user }) => {
      const prev = account.user;
      const next = clerkUser(user);
      if ((prev && prev.id) === (next && next.id)) return;
      account.user = next;
      notifyAccount(prev);
    });
  } catch (err) {
    console.warn('Clerk failed to start', err);
    account.mode = 'unavailable';
  }
}

function clerkUser(u) {
  if (!u) return null;
  const email = u.primaryEmailAddress ? u.primaryEmailAddress.emailAddress : '';
  return { id: u.id, name: u.fullName || u.username || email || 'Account', email, imageUrl: u.imageUrl || null };
}

const accountsEnabled = () => account.mode === 'clerk' || account.mode === 'dev';

async function signIn() {
  if (account.mode === 'clerk') {
    try {
      window.Clerk.openSignIn({});
    } catch (err) {
      console.error('openSignIn failed', err);
      if (window.Clerk.user) { account.user = clerkUser(window.Clerk.user); notifyAccount(null); }
      else toast('Sign-in could not open. Please try again.');
    }
  } else if (account.mode === 'dev') {
    const n = (prompt('Dev sign-in — any name:') || '').trim().replace(/[^\w.-]/g, '').slice(0, 32);
    if (!n) return;
    safeSet('pulse:devUser', n);
    const prev = account.user;
    account.user = { id: `dev_${n}`, name: n, email: `${n}@dev.local`, imageUrl: null };
    notifyAccount(prev);
  } else {
    toast(account.mode === 'unavailable' ? 'Sign-in is unavailable right now' : 'Accounts aren’t set up yet');
  }
}

async function signOut() {
  const prev = account.user;
  if (account.mode === 'clerk') await window.Clerk.signOut();
  else safeRemove('pulse:devUser');
  account.user = null;
  notifyAccount(prev);
}

async function authToken() {
  if (!account.user) return null;
  if (account.mode === 'clerk') {
    try { return await window.Clerk.session.getToken(); } catch { return null; }
  }
  if (account.mode === 'dev') return `dev:${account.user.name}`;
  return null;
}

async function authFetch(url, opts = {}) {
  const token = await authToken();
  const headers = { ...(opts.headers || {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  return fetch(url, { ...opts, headers });
}

// ───────────────────────── guest links ─────────────────────────
// A guest link comes with a secret claim token. It's kept on this device so
// that signing in later makes the link permanent and adds it to the account.

function guestLinks() {
  try {
    const list = JSON.parse(safeGet('pulse:claims') || '[]');
    return list.filter((c) => c && c.id && c.token && Date.parse(c.expiresAt) > Date.now());
  } catch { return []; }
}
function rememberGuestLink(entry) {
  const list = guestLinks().filter((c) => c.id !== entry.id);
  list.push(entry);
  safeSet('pulse:claims', JSON.stringify(list));
}

async function claimGuestLinks() {
  const list = guestLinks();
  if (!list.length || !account.user) return [];
  try {
    const res = await authFetch('/api/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ claims: list.map(({ id, token }) => ({ id, token })) }),
    });
    if (!res.ok) return [];
    const { claimed = [] } = await res.json();
    safeSet('pulse:claims', JSON.stringify(list.filter((c) => !claimed.includes(c.id))));
    if (claimed.length) {
      toast(claimed.length === 1 ? 'Your link is now saved to your account' : `${claimed.length} links saved to your account`);
      for (const fn of account.claimListeners) fn(claimed);
    }
    return claimed;
  } catch { return []; }
}
account.claimListeners = [];

// ───────────────────────── account button + My links ─────────────────────────

function updateAccountButton() {
  const b = $('acctBtn');
  if (!b) return;
  b.hidden = !accountsEnabled() || !account.ready;
  const u = account.user;
  b.classList.toggle('signed-in', !!u);
  b.textContent = '';
  if (u && u.imageUrl) {
    const img = document.createElement('img');
    img.src = u.imageUrl;
    img.alt = '';
    b.appendChild(img);
  } else if (u) {
    b.textContent = (u.name || '?').trim().charAt(0).toUpperCase();
  } else {
    b.textContent = 'Sign in';
  }
  b.setAttribute('aria-label', u ? `Account: ${u.name}` : 'Sign in');
}

$('acctBtn').addEventListener('click', () => {
  if (!account.user) { startSignIn(null); return; }
  openAccountSheet();
});

function openAccountSheet() {
  const u = account.user;
  $('acctName').textContent = u.name;
  $('acctEmail').textContent = u.email && u.email !== u.name ? u.email : '';
  const av = $('acctAvatar');
  av.style.backgroundImage = u.imageUrl ? `url("${u.imageUrl}")` : '';
  av.textContent = u.imageUrl ? '' : (u.name || '?').charAt(0).toUpperCase();
  $('accountSheet').hidden = false;
  loadMyLinks();
}

$('signOutBtn').addEventListener('click', async () => {
  $('accountSheet').hidden = true;
  await signOut();
  toast('Signed out');
});

async function loadMyLinks() {
  const box = $('myLinks');
  box.textContent = 'Loading…';
  try {
    const res = await authFetch('/api/links');
    if (!res.ok) throw new Error();
    const { links } = await res.json();
    box.textContent = '';
    if (!links.length) { box.textContent = 'No links yet. Tap Share to make one.'; return; }
    for (const l of links) box.appendChild(linkRow(l));
  } catch {
    box.textContent = 'Could not load your links.';
  }
}

function linkRow(l) {
  const row = document.createElement('div');
  row.className = 'link-row';
  const img = document.createElement('img');
  img.src = l.image; img.alt = ''; img.loading = 'lazy';
  const meta = document.createElement('div');
  meta.className = 'link-meta';
  const t = document.createElement('b'); t.textContent = l.title;
  const sub = document.createElement('small');
  sub.textContent = `${l.artist} · ${new Date(l.createdAt).toLocaleDateString()}`;
  meta.append(t, sub);
  const actions = document.createElement('div');
  actions.className = 'link-actions';
  const copy = document.createElement('button'); copy.textContent = 'Copy';
  copy.onclick = async () => { try { await navigator.clipboard.writeText(l.url); toast('Link copied'); } catch { toast(l.url); } };
  const open = document.createElement('a'); open.className = 'btn'; open.textContent = 'Open'; open.href = l.url; open.target = '_blank'; open.rel = 'noopener';
  const delBtn = document.createElement('button'); delBtn.textContent = 'Delete'; delBtn.className = 'danger';
  delBtn.onclick = async () => {
    if (!confirm(`Delete “${l.title}”? The link will stop working and the song and picture are removed.`)) return;
    delBtn.disabled = true;
    const res = await authFetch(`/api/links?id=${encodeURIComponent(l.id)}`, { method: 'DELETE' }).catch(() => null);
    if (res && res.ok) { row.remove(); toast('Link deleted'); if (!$('myLinks').children.length) loadMyLinks(); }
    else { delBtn.disabled = false; toast('Could not delete the link'); }
  };
  actions.append(copy, open, delBtn);
  row.append(img, meta, actions);
  return row;
}

// ───────────────────────── keeping work across sign-in ─────────────────────────
// Google/Apple sign-in leaves the page and comes back, which would lose the
// picked picture and song. They're saved in IndexedDB first and restored.

function idb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('pulse', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('draft');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbDo(mode, fn) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('draft', mode);
    const req = fn(tx.objectStore('draft'));
    tx.oncomplete = () => { db.close(); resolve(req && req.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
const saveDraft = (d) => idbDo('readwrite', (s) => s.put({ ...d, at: Date.now() }, 'current')).catch((e) => console.warn('draft save failed', e));
const loadDraft = () => idbDo('readonly', (s) => s.get('current')).catch(() => null);
const clearDraft = () => idbDo('readwrite', (s) => s.delete('current')).catch(() => {});

// Hook for app.js: returns the draft to save before leaving for sign-in.
let makeDraft = () => null;

async function startSignIn(pending) {
  const d = makeDraft(pending);
  if (d) await saveDraft(d);
  await signIn();
}

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch {} }
function safeRemove(k) { try { localStorage.removeItem(k); } catch {} }
