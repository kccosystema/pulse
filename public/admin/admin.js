// PulsePic admin dashboard. Every number comes from /api/admin/*, which checks
// on the server that the signed-in user is the admin; this page only renders.
'use strict';

const $ = (id) => document.getElementById(id);
const CLERK_JS_VERSION = '6.40.1';
const CLERK_UI_VERSION = '1.41.2';
let mode = 'none', devUser = null;

// ───────────────────────── sign-in ─────────────────────────

function loadScript(src, attrs = {}) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true; s.crossOrigin = 'anonymous';
    Object.assign(s.dataset, attrs);
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function token() {
  if (mode === 'clerk') return window.Clerk.session ? window.Clerk.session.getToken() : null;
  if (mode === 'dev') return devUser ? `dev:${devUser}` : null;
  return null;
}

async function api(path, opts = {}) {
  const t = await token();
  const res = await fetch(path, { ...opts, headers: { ...(opts.headers || {}), ...(t ? { authorization: `Bearer ${t}` } : {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || res.statusText), { status: res.status, code: body.error });
  return body;
}

function gate(msg, showSignIn) {
  $('app').hidden = true;
  $('gate').hidden = false;
  $('gateMsg').textContent = msg;
  $('gateSignIn').hidden = !showSignIn;
}

async function start() {
  const cfg = await fetch('/api/config').then((r) => r.json()).catch(() => ({}));
  mode = cfg.auth ? cfg.auth.mode : 'none';
  if (mode === 'clerk') {
    try {
      const base = `https://${cfg.auth.frontendApi}/npm`;
      await Promise.all([
        loadScript(`${base}/@clerk/clerk-js@${CLERK_JS_VERSION}/dist/clerk.browser.js`, { clerkPublishableKey: cfg.auth.publishableKey }),
        loadScript(`${base}/@clerk/ui@${CLERK_UI_VERSION}/dist/ui.browser.js`),
      ]);
      await window.Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
      window.Clerk.addListener(({ user }) => { if (user && $('app').hidden) enter(); });
    } catch {
      gate('Sign-in could not load. Refresh to try again.', false);
      return;
    }
  } else if (mode === 'dev') {
    try { devUser = localStorage.getItem('pulse:devUser'); } catch {}
  } else {
    gate('Accounts aren’t set up on this server.', false);
    return;
  }
  enter();
}

$('gateSignIn').addEventListener('click', () => {
  if (mode === 'clerk') window.Clerk.openSignIn({});
  else if (mode === 'dev') {
    const n = (prompt('Dev sign-in — any name:') || '').trim().replace(/[^\w.-]/g, '');
    if (n) { devUser = n; try { localStorage.setItem('pulse:devUser', n); } catch {} enter(); }
  }
});

async function enter() {
  const signedIn = mode === 'clerk' ? !!window.Clerk.user : !!devUser;
  if (!signedIn) { gate('Sign in with the admin account to continue.', true); return; }
  gate('Checking access…', false);
  try {
    const stats = await api(`/api/admin/stats?days=${days}`);
    const email = mode === 'clerk' ? window.Clerk.user.primaryEmailAddress?.emailAddress : `${devUser}@dev.local`;
    $('who').textContent = email || '';
    $('gate').hidden = true;
    $('app').hidden = false;
    renderStats(stats);
  } catch (err) {
    if (err.code === 'no-email-claim') {
      gate('Almost there: add your email to Clerk’s session token (Clerk dashboard → Sessions → Customize session token), then sign out and back in.', false);
    } else if (err.status === 403) {
      gate('This account isn’t authorized to view the admin area.', false);
    } else if (err.status === 401) {
      gate('Sign in with the admin account to continue.', true);
    } else {
      gate('Couldn’t load the dashboard. Refresh to try again.', false);
    }
  }
}

// ───────────────────────── tabs ─────────────────────────

let days = 30;
const loaded = { songs: false, users: false };

document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
  document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== b.dataset.tab; });
  if (b.dataset.tab === 'songs' && !loaded.songs) loadSongs();
  if (b.dataset.tab === 'users' && !loaded.users) loadUsers();
}));

document.querySelectorAll('[data-days]').forEach((b) => b.addEventListener('click', async () => {
  days = +b.dataset.days;
  document.querySelectorAll('[data-days]').forEach((x) => x.classList.toggle('on', x === b));
  renderStats(await api(`/api/admin/stats?days=${days}`));
}));

// ───────────────────────── analytics ─────────────────────────

const num = (n) => Number(n || 0).toLocaleString();
const METRICS = [
  ['home_view', 'Home page visits'],
  ['share_view', 'Share page views'],
  ['play', 'Plays (5 s+)'],
  ['share_created', 'Links created'],
  ['export', 'Videos exported'],
  ['signup', 'New users'],
];

function renderStats(s) {
  const p = s.period || {};
  const tiles = [
    ['Users', s.totals.users, `+${num(p.signup)} in ${s.days} days`],
    ['Songs', s.totals.songs, `${num(s.totals.memberSongs)} saved · ${num(s.totals.guestSongs)} guest`],
    ['Total plays', s.totals.plays, `+${num(p.play)} in ${s.days} days`],
    ['Page views', (p.home_view || 0) + (p.share_view || 0), `last ${s.days} days`],
    ['Links created', p.share_created, `last ${s.days} days`],
    ['Videos exported', p.export, `last ${s.days} days`],
  ];
  $('tiles').replaceChildren(...tiles.map(([label, value, sub]) => {
    const d = document.createElement('div');
    d.className = 'adm-tile';
    d.innerHTML = '<span></span><b></b><small></small>';
    d.children[0].textContent = label;
    d.children[1].textContent = num(value);
    d.children[2].textContent = sub;
    return d;
  }));
  $('statsNote').hidden = s.db;
  $('statsNote').textContent = 'Analytics need the database (Neon) to be connected.';

  // One small bar chart per metric: they have very different scales.
  const daysList = [];
  for (let i = s.days - 1; i >= 0; i--) daysList.push(new Date(Date.now() - i * 86400e3).toISOString().slice(0, 10));
  const byType = {};
  for (const r of s.series) (byType[r.type] ||= {})[r.day] = r.n;
  $('charts').replaceChildren(...METRICS.map(([type, label]) => chartCard(label, daysList, daysList.map((d) => (byType[type] || {})[d] || 0))));

  hbars($('topSongs'), s.topSongs.map((r) => [`${r.title} — ${r.artist}`, r.plays]), 'No plays yet');
  hbars($('countries'), s.countries.map((r) => [countryName(r.country), r.n]), 'No visits yet');
  hbars($('devices'), s.devices.map((r) => [r.device === 'mobile' ? 'Phone / tablet' : 'Desktop', r.n]), 'No visits yet');
}

function chartCard(label, labels, values) {
  const card = document.createElement('div');
  card.className = 'panel adm-card';
  const total = values.reduce((a, b) => a + b, 0);
  card.innerHTML = '<h3><span></span><small></small></h3><div class="total"></div><div class="adm-chart"></div>';
  card.querySelector('h3 span').textContent = label;
  card.querySelector('h3 small').textContent = `${labels.length} days`;
  card.querySelector('.total').textContent = num(total);

  const n = values.length, max = Math.max(1, ...values);
  const W = 300, H = 110, gap = n > 40 ? 1 : 2, bw = (W - gap * (n - 1)) / n;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${label}: ${num(total)} over ${n} days`);
  const base = document.createElementNS(ns, 'line');
  Object.entries({ x1: 0, x2: W, y1: H - 0.5, y2: H - 0.5, stroke: 'rgba(255,255,255,.12)', 'stroke-width': 1 }).forEach(([k, v]) => base.setAttribute(k, v));
  svg.appendChild(base);
  values.forEach((v, i) => {
    const h = v ? Math.max(2, (v / max) * (H - 6)) : 0;
    const x = i * (bw + gap);
    // generous invisible hit target for the tooltip
    const hit = document.createElementNS(ns, 'rect');
    Object.entries({ x, y: 0, width: bw + gap, height: H, fill: 'transparent' }).forEach(([k, a]) => hit.setAttribute(k, a));
    const bar = document.createElementNS(ns, 'rect');
    Object.entries({ x, y: H - h, width: Math.max(1, bw), height: h, rx: Math.min(2, bw / 2), fill: 'var(--accent)' }).forEach(([k, a]) => bar.setAttribute(k, a));
    const show = (e) => tip(e, `${fmtDay(labels[i])}: <b>${num(v)}</b>`);
    hit.addEventListener('pointerenter', show);
    hit.addEventListener('pointermove', show);
    hit.addEventListener('pointerleave', hideTip);
    svg.append(bar, hit);
  });
  const wrap = card.querySelector('.adm-chart');
  wrap.appendChild(svg);
  const axis = document.createElement('div');
  axis.className = 'axis';
  axis.innerHTML = '<span></span><span></span>';
  axis.children[0].textContent = fmtDay(labels[0]);
  axis.children[1].textContent = 'Today';
  wrap.appendChild(axis);

  const det = document.createElement('details');
  det.innerHTML = '<summary>Table</summary><table><tbody></tbody></table>';
  const tb = det.querySelector('tbody');
  labels.slice().reverse().forEach((d, i) => {
    const tr = tb.insertRow();
    tr.insertCell().textContent = fmtDay(d);
    tr.insertCell().textContent = num(values[values.length - 1 - i]);
  });
  card.appendChild(det);
  return card;
}

function hbars(el, rows, empty) {
  if (!rows.length) { el.innerHTML = `<p class="adm-empty">${empty}</p>`; return; }
  const max = Math.max(1, ...rows.map((r) => r[1]));
  el.replaceChildren(...rows.map(([label, v]) => {
    const d = document.createElement('div');
    d.className = 'adm-hbar';
    d.innerHTML = '<span class="lab"></span><span class="val"></span><div class="track"><div class="fill"></div></div>';
    d.querySelector('.lab').textContent = label;
    d.querySelector('.val').textContent = num(v);
    d.querySelector('.fill').style.width = `${(v / max) * 100}%`;
    return d;
  }));
}

const fmtDay = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
let regionNames = null;
function countryName(code) {
  if (!code || code === '??') return 'Unknown';
  try { regionNames ||= new Intl.DisplayNames(undefined, { type: 'region' }); return regionNames.of(code) || code; } catch { return code; }
}

function tip(e, html) {
  const t = $('tip');
  t.innerHTML = html;
  t.hidden = false;
  const x = Math.min(window.innerWidth - t.offsetWidth - 8, e.clientX + 12);
  t.style.left = `${Math.max(8, x)}px`;
  t.style.top = `${e.clientY - t.offsetHeight - 10}px`;
}
const hideTip = () => { $('tip').hidden = true; };

// ───────────────────────── songs ─────────────────────────

let songs = [];
async function loadSongs() {
  $('songCount').textContent = 'Loading…';
  try {
    songs = (await api('/api/admin/songs')).songs;
    loaded.songs = true;
    renderSongs();
  } catch { $('songCount').textContent = 'Couldn’t load songs.'; }
}

function renderSongs() {
  const q = $('songSearch').value.trim().toLowerCase();
  let list = songs.filter((s) => !q || [s.title, s.artist, s.album, s.owner?.email, s.owner?.name, s.id].join(' ').toLowerCase().includes(q));
  const sort = $('songSort').value;
  if (sort === 'plays') list = list.slice().sort((a, b) => b.plays - a.plays);
  if (sort === 'likes') list = list.slice().sort((a, b) => (b.likes || 0) - (a.likes || 0));
  if (sort === 'comments') list = list.slice().sort((a, b) => (b.comments || 0) - (a.comments || 0));
  if (sort === 'title') list = list.slice().sort((a, b) => a.title.localeCompare(b.title));
  $('songCount').textContent = `${list.length} of ${songs.length} songs · ${num(list.reduce((s, x) => s + (x.realPlays ?? x.plays), 0))} real plays`;
  $('songs').replaceChildren(...list.map(songRow));
}
$('songSearch').addEventListener('input', renderSongs);
$('songSort').addEventListener('change', renderSongs);

function songRow(s) {
  const row = document.createElement('div');
  row.className = 'adm-row';
  row.innerHTML = `<img alt="" loading="lazy"><div class="main"><b></b><small></small></div>
    <div class="stats"><span>🔥 <b class="p"></b> plays</span><span>♥ <b class="lk"></b></span><span>💬 <b class="cm"></b></span><span class="who"></span><span class="when"></span></div>
    <div class="acts"><a class="btn" target="_blank" rel="noopener">Open</a><button type="button">Copy</button><button type="button" class="danger">Delete</button></div>`;
  if (s.mine) {
    const t = document.createElement('button');
    t.type = 'button'; t.className = 'tools-btn'; t.textContent = '🛠 Tools';
    t.setAttribute('aria-expanded', 'false');
    row.querySelector('.acts').prepend(t);
    t.onclick = () => toggleTools(row, s, t);
  }
  row.querySelector('img').src = s.image || '';
  row.querySelector('.main b').textContent = s.title;
  row.querySelector('.main small').textContent = [s.artist, s.album].filter(Boolean).join(' · ');
  showCounts(row, s);
  row.querySelector('.cm').textContent = num(s.comments || 0);
  const who = row.querySelector('.who');
  const pill = document.createElement('span');
  if (s.owner) {
    pill.className = 'pill member';
    pill.textContent = s.owner.email || s.owner.name || 'member';
  } else {
    pill.className = 'pill guest';
    pill.textContent = s.expired ? 'guest · expired' : `guest · expires ${fmtDate(s.expiresAt)}`;
  }
  who.appendChild(pill);
  row.querySelector('.when').textContent = `Created ${fmtDate(s.createdAt)}`;
  row.querySelector('a').href = s.url;
  const [copy, del] = row.querySelectorAll('.acts button:not(.tools-btn)');
  copy.onclick = async () => { try { await navigator.clipboard.writeText(s.url); toast('Link copied'); } catch { toast(s.url); } };
  del.onclick = async () => {
    if (!confirm(`Delete “${s.title}” by ${s.artist}? The link stops working and its song and picture are removed. This can’t be undone.`)) return;
    del.disabled = true;
    try {
      await api(`/api/admin/songs?id=${encodeURIComponent(s.id)}`, { method: 'DELETE' });
      songs = songs.filter((x) => x.id !== s.id);
      renderSongs();
      toast('Song deleted');
    } catch { del.disabled = false; toast('Could not delete'); }
  };
  return row;
}

// Shown numbers, plus "(N real)" when you've set them yourself.
function showCounts(row, s) {
  const real = (n, r) => (r != null && r !== n ? ` (${num(r)} real)` : '');
  row.querySelector('.p').textContent = num(s.plays) + real(s.plays, s.realPlays);
  row.querySelector('.lk').textContent = num(s.likes || 0) + real(s.likes || 0, s.realLikes);
}

// ── Tools for your own songs: set the jam count, add comments under any name ──
const FUNNY_NAMES = ['DJ Nova', 'Auntie Pam', 'BassHead420', 'Grandma Beats', 'Lil Subwoofer', 'Chef Remix', 'Professor Groove',
  'Karen (manager)', 'Your Ex', 'Neighbor w/ Earplugs', 'Mr. Reverb', 'Disco Steve', 'Uber Driver Mike', 'The Cat', 'Tiny Tim Tempo',
  'Coach Drop', 'Officer Funk', 'Mom', 'Sound Guy Gary', 'Barista Bri'];
const FUNNY_TEXTS = ['my speakers filed a noise complaint 🔊', 'played this at a funeral and everyone started dancing',
  'the bass rearranged my furniture', 'I was NOT ready for that drop 😭', 'my cat started bopping, this is a problem',
  'put this on in the car and my GPS rerouted to the club', 'grandma just asked me to run it back', 'my neighbors know every word now',
  'listened 47 times, still not tired', 'this beat should be illegal 🚨', 'cooked dinner to this and burned it. worth it',
  'my headphones are begging for a break', 'the cover art pulsing is hypnotizing 😵‍💫', 'certified banger, no notes',
  'this cured my Monday', 'I hit replay so hard my thumb hurts', 'my plants grew 3 inches from this vibe 🌱',
  'just quit my job to dance full time', 'the 2am drive song we needed', 'turned it up and my car alarm joined in'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function toggleTools(row, s, btn) {
  const open = row.querySelector('.tools');
  if (open) { open.remove(); btn.setAttribute('aria-expanded', 'false'); return; }
  btn.setAttribute('aria-expanded', 'true');
  const box = document.createElement('div');
  box.className = 'tools';
  box.innerHTML = `
    <form class="t-jams"><label>🔥 Jam count <input type="number" min="0" max="100000000" step="1" inputmode="numeric" required></label><button type="submit" class="accent">Save</button></form>
    <form class="t-likes t-jams"><label>♥ Like count <input type="number" min="0" max="100000000" step="1" inputmode="numeric" required></label><button type="submit" class="accent">Save</button></form>
    <p class="t-note">Numbers you set show on the share page but are left out of Analytics. Real plays and likes keep adding on top.</p>
    <form class="t-comment">
      <div class="t-line"><input class="t-name" maxlength="40" placeholder="Display name" required aria-label="Display name"><button type="button" class="t-rand" title="Random funny comment">🎲 Random</button></div>
      <textarea class="t-text" maxlength="500" rows="2" placeholder="Comment" required aria-label="Comment"></textarea>
      <button type="submit" class="accent">Add comment</button>
    </form>
    <div class="t-list"><small>Loading comments…</small></div>`;
  row.append(box);
  const jamInput = box.querySelector('.t-jams:not(.t-likes) input');
  const likeInput = box.querySelector('.t-likes input');
  likeInput.value = s.likes || 0;
  box.querySelector('.t-likes').onsubmit = async (e) => {
    e.preventDefault();
    const b = e.target.querySelector('button'); b.disabled = true;
    try {
      const r = await api('/api/admin/likes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: s.id, count: Math.round(+likeInput.value) }) });
      s.likes = r.likes; showCounts(row, s);
      toast(`Likes set to ${num(r.likes)}`);
    } catch (err) { toast(err.message || 'Could not save'); }
    b.disabled = false;
  };
  jamInput.value = s.plays;
  box.querySelector('.t-jams:not(.t-likes)').onsubmit = async (e) => {
    e.preventDefault();
    const b = e.target.querySelector('button'); b.disabled = true;
    try {
      const r = await api('/api/admin/jams', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: s.id, count: Math.round(+jamInput.value) }) });
      s.plays = r.plays; showCounts(row, s);
      toast(`Jams set to ${num(r.plays)}`);
    } catch (err) { toast(err.message || 'Could not save'); }
    b.disabled = false;
  };
  const nameIn = box.querySelector('.t-name'), textIn = box.querySelector('.t-text');
  box.querySelector('.t-rand').onclick = () => { nameIn.value = pick(FUNNY_NAMES); textIn.value = pick(FUNNY_TEXTS); };
  box.querySelector('.t-comment').onsubmit = async (e) => {
    e.preventDefault();
    const b = e.target.querySelector('button[type=submit]'); b.disabled = true;
    try {
      await api('/api/admin/comment', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: s.id, name: nameIn.value, text: textIn.value }) });
      textIn.value = '';
      s.comments = (s.comments || 0) + 1; row.querySelector('.cm').textContent = num(s.comments);
      toast('Comment added');
      loadToolComments(box, s, row);
    } catch (err) { toast(err.message || 'Could not add'); }
    b.disabled = false;
  };
  loadToolComments(box, s, row);
}

async function loadToolComments(box, s, row) {
  const list = box.querySelector('.t-list');
  try {
    const r = await api(`/api/comments?id=${encodeURIComponent(s.id)}`);
    const items = r.comments || [];
    if (!items.length) { list.innerHTML = '<small>No comments yet.</small>'; return; }
    list.replaceChildren(...items.map((c) => {
      const el = document.createElement('div'); el.className = 't-item';
      const t = document.createElement('div');
      const n = document.createElement('b'); n.textContent = c.name;
      const body = document.createElement('span'); body.textContent = c.body;
      t.append(n, body);
      const del = document.createElement('button'); del.type = 'button'; del.className = 'danger'; del.textContent = 'Delete';
      del.onclick = async () => {
        if (!confirm(`Delete this comment by ${c.name}?`)) return;
        try {
          await api(`/api/comments?id=${encodeURIComponent(s.id)}&comment=${encodeURIComponent(c.id)}`, { method: 'DELETE' });
          el.remove(); s.comments = Math.max(0, (s.comments || 1) - 1); row.querySelector('.cm').textContent = num(s.comments);
          if (!list.children.length) list.innerHTML = '<small>No comments yet.</small>';
        } catch (err) { toast(err.message || 'Could not delete'); }
      };
      el.append(t, del);
      return el;
    }));
  } catch { list.innerHTML = '<small>Could not load comments.</small>'; }
}

// ───────────────────────── users ─────────────────────────

let users = [];
async function loadUsers() {
  $('userCount').textContent = 'Loading…';
  try {
    users = (await api('/api/admin/users')).users;
    loaded.users = true;
    renderUsers();
  } catch { $('userCount').textContent = 'Couldn’t load users.'; }
}

function renderUsers() {
  const q = $('userSearch').value.trim().toLowerCase();
  const list = users.filter((u) => !q || [u.name, u.email, u.id].join(' ').toLowerCase().includes(q));
  $('userCount').textContent = `${list.length} of ${users.length} users`;
  $('users').replaceChildren(...list.map(userRow));
}
$('userSearch').addEventListener('input', renderUsers);

function userRow(u) {
  const row = document.createElement('div');
  row.className = 'adm-row';
  row.innerHTML = `<span class="avatar"></span><div class="main"><b></b><small></small></div>
    <div class="stats"><span><b class="l"></b> links</span><span>🔥 <b class="p"></b> plays</span></div>
    <div class="stats when"></div>`;
  const av = row.querySelector('.avatar');
  if (u.imageUrl) { const img = document.createElement('img'); img.src = u.imageUrl; img.alt = ''; img.loading = 'lazy'; av.replaceWith(img); }
  else av.textContent = (u.name || u.email || '?').charAt(0).toUpperCase();
  row.querySelector('.main b').textContent = u.name || u.email || (u.untracked ? 'Not seen since tracking started' : 'Unknown');
  row.querySelector('.main small').textContent = u.untracked ? u.id : (u.email || u.id);
  row.querySelector('.l').textContent = num(u.links);
  row.querySelector('.p').textContent = num(u.plays);
  row.querySelector('.when').textContent = u.untracked ? 'Will appear fully next time they open PulsePic' : `Joined ${fmtDate(u.createdAt)} · last seen ${fmtDate(u.lastSeen)}`;
  return row;
}

// ───────────────────────── misc ─────────────────────────

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
}

start();
