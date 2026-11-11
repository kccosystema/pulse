// Share page: plays a shared song with the creator's picture and effects.
'use strict';

const data = JSON.parse($('pulse-data').textContent);

// Leave room between the picture and the card for the like/comment buttons.
const SOCIAL_ROOM = 58;
engine.areaHeight = () => $('card').getBoundingClientRect().top - ($('social').hidden ? 0 : SOCIAL_ROOM);
engine.onFrame = () => { updateTime(); placeSocial(); };

// Like/comment buttons sit just under the picture, lined up with its left
// edge; the play button sits inside the picture's lower-right corner.
let socialPos = '', playPos = '';
const PLAY_SIZE = 64, PLAY_INSET = 14;
let floatBottom = -1;
function placeSocial() {
  const fb = Math.round(window.innerHeight - $('card').getBoundingClientRect().top + 6);
  if (fb !== floatBottom) { floatBottom = fb; $('floaters').style.setProperty('--float-bottom', `${fb}px`); }
  const r = engine.imageRect, el = $('social');
  if (!r) return;
  const bp = $('bigPlay');
  if (!bp.hidden) {
    const inset = Math.min(PLAY_INSET, r.w * 0.05);
    const pp = `${Math.round(r.x + r.w - PLAY_SIZE - inset)},${Math.round(r.y + r.h - PLAY_SIZE - inset)}`;
    if (pp !== playPos) {
      playPos = pp;
      const [x, y] = pp.split(',');
      bp.style.left = `${x}px`; bp.style.top = `${y}px`;
      bp.classList.add('placed');
    }
  }
  if (el.hidden) return;
  const pos = `${Math.round(r.x)},${Math.round(r.y + r.h + 12)}`;
  if (pos === socialPos) return;
  socialPos = pos;
  el.style.left = `${Math.max(8, Math.round(r.x))}px`;
  el.style.top = `${Math.round(r.y + r.h + 12)}px`;
}

// The creator's look; the picture's credits are shown in the card instead.
state.fx = data.settings.fx || {};
state.intensity = data.settings.intensity;
state.sensitivity = data.settings.sensitivity;
state.mode = data.settings.mode;
state.showCredits = false;
state.audioDelay = data.audio.delay || 0;
try { state.offset = +localStorage.getItem('pulse:viewOffset') || 0; } catch {}

if (data.analysis) {
  const a = data.analysis;
  state.analysis = {
    bpm: a.bpm,
    beats: a.beats.map(([t, s, d]) => ({ t, s, down: !!d })),
    kicks: a.kicks.map(([t, z]) => ({ t, z })),
    hits: a.hits.map(([t, z]) => ({ t, z })),
  };
}

const img = new Image();
img.onload = () => { state.img = img; state.bgBlur = makeBlur(img); };
img.src = data.image.url;

// Web Audio needs CORS; if the store doesn't send it, go through /api/media.
let usedProxy = false;
audio.src = data.audio.url;
audio.addEventListener('error', () => {
  if (usedProxy) { toast('Could not load the song'); return; }
  usedProxy = true;
  const t = audio.currentTime;
  audio.src = `/api/media?u=${encodeURIComponent(data.audio.url)}`;
  if (t) audio.currentTime = t;
  if (started) audio.play().catch(() => {});
});

let started = false;
async function start() {
  initAudio();
  try { await actx.resume(); } catch {}
  started = true;
  $('bigPlay').hidden = true;
  play();
}
$('bigPlay').addEventListener('click', start);
// If the picture never loads, still show the play button (centred).
setTimeout(() => { const bp = $('bigPlay'); if (!bp.classList.contains('placed')) { bp.style.left = 'calc(50% - 32px)'; bp.classList.add('placed'); } }, 3000);
$('playBtn').addEventListener('click', () => (!started ? start() : audio.paused ? play() : audio.pause()));
audio.addEventListener('play', () => { $('playBtn').textContent = '❚❚'; $('playBtn').ariaLabel = 'Pause'; $('bigPlay').hidden = true; });
audio.addEventListener('pause', () => { $('playBtn').textContent = '▶'; $('playBtn').ariaLabel = 'Play'; });

let seeking = false;
$('seek').addEventListener('input', () => {
  seeking = true;
  if (audio.duration) audio.currentTime = ($('seek').value / 1000) * audio.duration;
});
$('seek').addEventListener('change', () => { seeking = false; });

const fmt = (s) => (isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');
let lastShown = -1;
function updateTime() {
  const t = Math.floor(audio.currentTime);
  if (!seeking && audio.duration) $('seek').value = Math.round((audio.currentTime / audio.duration) * 1000);
  if (t !== lastShown) { lastShown = t; $('time').textContent = fmt(audio.currentTime); }
}

$('shareBtn').addEventListener('click', async () => {
  const url = location.href.split('#')[0];
  if (navigator.share) {
    try { await navigator.share({ title: `${data.title} — ${data.artist}`, url }); } catch {}
    return;
  }
  try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast(url); }
});

// ───────────────────────── "jammed X times" ─────────────────────────
// A play counts once the listener has heard 5 seconds, once per browser per day.
(() => {
  const badge = $('jams');
  const show = (n, bump) => {
    badge.textContent = '';
    if (n > 0) {
      const b = document.createElement('b');
      b.textContent = n.toLocaleString();
      badge.append('🔥 This has been jammed ', b, n === 1 ? ' time!' : ' times!');
    } else {
      badge.textContent = '🔥 Be the first to jam this!';
    }
    badge.hidden = false;
    if (bump) { badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump'); }
  };

  fetch(`/api/plays?id=${encodeURIComponent(data.id)}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((r) => { if (r.enabled) show(r.plays[data.id] || 0, false); })
    .catch(() => {});

  const day = new Date().toISOString().slice(0, 10);
  const seenKey = `pulse:jam:${data.id}`;
  let counted = false;
  try { counted = localStorage.getItem(seenKey) === day; } catch {}
  let heard = 0, lastT = null;
  audio.addEventListener('timeupdate', () => {
    if (counted || audio.paused) { lastT = null; return; }
    const t = audio.currentTime;
    if (lastT !== null && t > lastT && t - lastT < 1.5) heard += t - lastT;
    lastT = t;
    if (heard < 5) return;
    counted = true;
    try { localStorage.setItem(seenKey, day); } catch {}
    fetch(`/api/plays?id=${encodeURIComponent(data.id)}`, { method: 'POST' })
      .then((r) => r.json())
      .then((r) => { if (r.enabled) show(r.plays, true); })
      .catch(() => {});
  });
  audio.addEventListener('seeking', () => { lastT = null; });
})();

// Anonymous view count for the admin dashboard.
fetch('/api/track', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'share_view', id: data.id }), keepalive: true }).catch(() => {});

// ───────────────────────── likes + comments ─────────────────────────
// Likes: anyone, once a day per song (the server also limits per network).
// Comments: anyone can read; posting needs a sign-in (loaded only when the
// comments sheet is opened, so the page stays light).
(() => {
  const CLERK_JS_VERSION = '6.40.1';
  const CLERK_UI_VERSION = '1.41.2';
  const id = encodeURIComponent(data.id);
  const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  const ss = { get(k) { try { return sessionStorage.getItem(k); } catch { return null; } }, set(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch {} } };

  // Anonymous visitor id for "one like per day".
  let visitor = ls.get('pulse:vid');
  if (!visitor || !/^[\w-]{8,64}$/.test(visitor)) {
    visitor = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
    ls.set('pulse:vid', visitor);
  }

  const likeBtn = $('likeBtn'), likeCount = $('likeCount'), commentCount = $('commentCount');
  let liked = false, likes = 0, comments = 0, liking = false;
  const showLikes = () => {
    likeCount.textContent = likes.toLocaleString();
    likeBtn.setAttribute('aria-pressed', String(liked));
    likeBtn.setAttribute('aria-label', liked ? `Liked today · ${likes} likes` : `Like this song · ${likes} likes`);
  };
  const showComments = () => {
    commentCount.textContent = comments.toLocaleString();
    $('cTotal').textContent = comments ? `(${comments.toLocaleString()})` : '';
  };

  fetch(`/api/likes?id=${id}`, { cache: 'no-store', headers: { 'x-pulse-visitor': visitor } })
    .then((r) => r.json())
    .then((r) => {
      if (!r.enabled) return;
      likes = r.likes || 0; liked = !!r.likedToday; comments = r.comments || 0;
      showLikes(); showComments();
      $('social').hidden = false;
      loadFloaters();
      if (ss.get('pulse:openComments') === data.id) openComments();
    })
    .catch(() => {});

  likeBtn.addEventListener('click', async () => {
    if (liking) return;
    if (liked) { toast('You already liked this today. Come back tomorrow! ❤️'); return; }
    liking = true;
    liked = true; likes++; showLikes();
    likeBtn.classList.remove('pop'); void likeBtn.offsetWidth; likeBtn.classList.add('pop');
    try {
      const res = await fetch(`/api/likes?id=${id}`, { method: 'POST', headers: { 'x-pulse-visitor': visitor } });
      const r = await res.json().catch(() => ({}));
      if (typeof r.likes === 'number') likes = r.likes;
      liked = res.ok ? true : !!r.likedToday;
      if (!res.ok && r.error) toast(r.error);
    } catch {
      liked = false; likes = Math.max(0, likes - 1);
      toast('Could not save your like. Check your connection.');
    }
    showLikes();
    liking = false;
  });

  // ── sign-in (Clerk in production, a fake name on the local dev server) ──
  const auth = { mode: null, user: null, loading: null };
  const loadScript = (src, attrs = {}) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true; s.crossOrigin = 'anonymous';
    Object.assign(s.dataset, attrs);
    s.onload = resolve; s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
  function initAuth() {
    auth.loading ||= (async () => {
      const cfg = await fetch('/api/config').then((r) => r.json()).catch(() => ({}));
      const a = cfg.auth || { mode: 'none' };
      auth.mode = a.mode;
      if (a.mode === 'clerk') {
        try {
          const base = `https://${a.frontendApi}/npm`;
          await Promise.all([
            loadScript(`${base}/@clerk/clerk-js@${CLERK_JS_VERSION}/dist/clerk.browser.js`, { clerkPublishableKey: a.publishableKey }),
            loadScript(`${base}/@clerk/ui@${CLERK_UI_VERSION}/dist/ui.browser.js`),
          ]);
          await window.Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
          auth.user = window.Clerk.user ? { id: window.Clerk.user.id } : null;
          window.Clerk.addListener(({ user }) => {
            const had = !!auth.user;
            auth.user = user ? { id: user.id } : null;
            if (had !== !!auth.user) { renderComposer(); loadComments(); }
          });
        } catch (err) {
          console.warn('sign-in unavailable', err);
          auth.mode = 'unavailable';
        }
      } else if (a.mode === 'dev') {
        const n = ls.get('pulse:devUser');
        auth.user = n ? { id: `dev_${n}`, name: n } : null;
      }
    })();
    return auth.loading;
  }
  async function token() {
    if (!auth.user) return null;
    if (auth.mode === 'clerk') { try { return await window.Clerk.session.getToken(); } catch { return null; } }
    if (auth.mode === 'dev') return `dev:${auth.user.name}`;
    return null;
  }
  async function authHeaders(extra = {}) {
    const t = await token();
    return t ? { ...extra, authorization: `Bearer ${t}` } : extra;
  }
  function signIn() {
    if (auth.mode === 'clerk') {
      ss.set('pulse:openComments', data.id); // reopen this sheet after the sign-in redirect
      const back = location.href.split('#')[0];
      try { window.Clerk.openSignIn({ forceRedirectUrl: back, signUpForceRedirectUrl: back }); }
      catch { toast('Sign-in could not open. Please try again.'); }
    } else if (auth.mode === 'dev') {
      const n = (prompt('Dev sign-in — any name:') || '').trim().replace(/[^\w.-]/g, '').slice(0, 32);
      if (!n) return;
      ls.set('pulse:devUser', n);
      auth.user = { id: `dev_${n}`, name: n };
      renderComposer(); loadComments();
    } else {
      toast('Sign-in is unavailable right now');
    }
  }

  // ── comments sheet ──
  const sheet = $('commentsSheet'), list = $('cList'), err = $('cError');
  const showErr = (msg) => { err.textContent = msg || ''; err.hidden = !msg; };

  function ago(iso) {
    const s = Math.max(0, (Date.now() - new Date(iso)) / 1000);
    if (s < 60) return 'just now';
    const units = [[60, 'm'], [24, 'h'], [7, 'd'], [4.35, 'w'], [12, 'mo'], [Infinity, 'y']];
    let v = s / 60;
    for (const [n, u] of units) { if (v < n) return `${Math.floor(v)}${u} ago`; v /= n; }
    return '';
  }

  function commentEl(c) {
    const el = document.createElement('div');
    el.className = 'c-item';
    let av;
    if (c.image) { av = document.createElement('img'); av.src = c.image; av.alt = ''; av.loading = 'lazy'; av.referrerPolicy = 'no-referrer'; }
    else { av = document.createElement('span'); av.textContent = (c.name || '?').trim().charAt(0).toUpperCase(); av.setAttribute('aria-hidden', 'true'); }
    av.className = 'c-avatar';
    const meta = document.createElement('div');
    meta.className = 'c-meta';
    const nm = document.createElement('b'); nm.textContent = c.name;
    const when = document.createElement('time'); when.dateTime = c.at; when.textContent = ago(c.at); when.title = new Date(c.at).toLocaleString();
    meta.append(nm, when);
    const body = document.createElement('p'); body.className = 'c-body'; body.textContent = c.body;
    el.append(av, meta);
    if (c.canDelete) {
      const del = document.createElement('button');
      del.type = 'button'; del.className = 'c-del'; del.textContent = 'Delete';
      del.setAttribute('aria-label', `Delete comment by ${c.name}`);
      del.addEventListener('click', () => removeComment(c, el));
      el.append(del);
    }
    el.append(body);
    return el;
  }

  function renderList(items) {
    list.replaceChildren(...(items.length ? items.map(commentEl) : [Object.assign(document.createElement('p'), { className: 'c-empty', textContent: 'No comments yet. Be the first!' })]));
  }

  let loadSeq = 0;
  async function loadComments() {
    const seq = ++loadSeq;
    try {
      const r = await fetch(`/api/comments?id=${id}`, { cache: 'no-store', headers: await authHeaders() }).then((x) => x.json());
      if (seq !== loadSeq) return;
      const items = r.comments || [];
      renderList(items);
      if (items.length < 100 && items.length !== comments) { comments = items.length; showComments(); }
    } catch {
      if (seq === loadSeq) list.replaceChildren(Object.assign(document.createElement('p'), { className: 'c-empty', textContent: 'Could not load comments.' }));
    }
  }

  function renderComposer() {
    const can = auth.mode === 'clerk' || auth.mode === 'dev';
    $('cForm').hidden = !auth.user;
    $('cSignIn').hidden = !!auth.user || !can;
    if (!can && auth.mode) showErr(auth.mode === 'unavailable' ? 'Sign-in is unavailable right now, so you can read but not post.' : '');
  }

  async function openComments() {
    ss.set('pulse:openComments', null);
    showErr('');
    sheet.hidden = false;
    list.replaceChildren(Object.assign(document.createElement('p'), { className: 'c-empty', textContent: 'Loading…' }));
    $('cForm').hidden = true; $('cSignIn').hidden = true;
    loadComments();
    await initAuth();
    renderComposer();
    loadComments(); // again with the sign-in, so your own comments show Delete
  }
  const closeComments = () => { sheet.hidden = true; };

  $('commentBtn').addEventListener('click', openComments);
  sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('[data-close]')) closeComments(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) closeComments(); });
  $('cSignInBtn').addEventListener('click', signIn);

  const text = $('cText');
  const left = () => { $('cLeft').textContent = String(500 - text.value.length); };
  text.addEventListener('input', () => {
    left();
    text.style.height = 'auto';
    text.style.height = `${Math.min(140, text.scrollHeight + 2)}px`;
  });

  $('cForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = text.value.trim();
    if (!body) return;
    showErr('');
    $('cPost').disabled = true;
    try {
      const res = await fetch(`/api/comments?id=${id}`, {
        method: 'POST',
        headers: await authHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ text: body }),
      });
      const r = await res.json().catch(() => ({}));
      if (res.status === 401) { auth.user = null; renderComposer(); showErr('Please sign in again to comment.'); return; }
      if (!res.ok) { showErr(r.error || 'Could not post your comment.'); return; }
      text.value = ''; left(); text.style.height = '';
      comments++; showComments();
      const empty = list.querySelector('.c-empty');
      if (empty) empty.remove();
      list.prepend(commentEl(r.comment));
      if (window.__pulseFloat) window.__pulseFloat.add(r.comment);
      list.scrollTop = 0;
    } catch {
      showErr('Could not post your comment. Check your connection.');
    } finally {
      $('cPost').disabled = false;
    }
  });

  async function removeComment(c, el) {
    if (!confirm('Delete this comment?')) return;
    try {
      const res = await fetch(`/api/comments?id=${id}&comment=${encodeURIComponent(c.id)}`, { method: 'DELETE', headers: await authHeaders() });
      if (!res.ok) { const r = await res.json().catch(() => ({})); toast(r.error || 'Could not delete'); return; }
      el.remove();
      comments = Math.max(0, comments - 1); showComments();
      if (!list.children.length) renderList([]);
    } catch { toast('Could not delete. Check your connection.'); }
  }

  // ── floating "dancing" comments ──
  // Comments drift up from the card to the top, swaying side to side and
  // bopping on the beat while the song plays. ?demo=1 adds sample comments
  // (in this browser only, nothing is saved) to preview the effect.
  const floaters = $('floaters');
  const demo = /[?&]demo=(1|comments)\b/.test(location.search);
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DEMO = [
    ['Jay', 'this one goes HARD 🔥🔥'], ['Mia', 'the colors on the beat 😍'], ['DJ Nova', 'Adding this to my set tonight'],
    ['Chris', 'on repeat all day'], ['Lena', 'that drop at 0:45 though!!'], ['Marco', 'cover art is insane'],
    ['Tasha', 'who else is vibing rn 💃'], ['Ken', 'need the full album'], ['Riley', 'sent this to the whole group chat'],
    ['Sam', 'chills every time'], ['Ava', '❤️❤️❤️'], ['Omar', 'producer went crazy on this one'],
  ].map(([name, body], i) => ({ id: `demo${i}`, name, body, image: null, at: new Date().toISOString(), demo: true }));
  let pool = [], cursor = 0, timer = null, alive = 0;
  const MAX_ON_SCREEN = 4, EVERY_MS = 1900;

  function makeFloater(c, mine) {
    const f = document.createElement('div');
    f.className = 'floater' + (mine ? ' mine' : '');
    const w = floaters.clientWidth || window.innerWidth;
    const lane = Math.random();
    f.style.setProperty('--x', '0px'); // measured at the left edge first, then placed
    f.style.setProperty('--dur', `${(6.5 + Math.random() * 2.5).toFixed(2)}s`);
    f.style.setProperty('--rise', `${Math.max(200, floaters.clientHeight)}px`);
    f.style.setProperty('--sway', `${(1.4 + Math.random() * 0.9).toFixed(2)}s`);
    f.style.setProperty('--amp', `${Math.round(8 + Math.random() * 14)}px`);
    f.style.setProperty('--delay', `-${(Math.random() * 1.5).toFixed(2)}s`);
    const sway = document.createElement('div'); sway.className = 'sway';
    const bop = document.createElement('div'); bop.className = 'bop';
    let av;
    if (c.image) { av = document.createElement('img'); av.src = c.image; av.alt = ''; av.referrerPolicy = 'no-referrer'; }
    else { av = document.createElement('span'); av.textContent = (c.name || '?').trim().charAt(0).toUpperCase(); }
    av.className = 'f-av';
    const txt = document.createElement('div'); txt.className = 'f-txt';
    const nm = document.createElement('b'); nm.textContent = c.name;
    const body = document.createElement('span'); body.textContent = c.body.length > 120 ? `${c.body.slice(0, 117)}…` : c.body;
    txt.append(nm, body);
    bop.append(av, txt); sway.append(bop); f.append(sway);
    alive++;
    f.addEventListener('animationend', (e) => { if (e.target === f) { f.remove(); alive--; } });
    floaters.append(f);
    // Keep the whole bubble on screen (wider comments start further left).
    const amp = parseFloat(f.style.getPropertyValue('--amp')) + 8; // sway + tilt
    const room = w - f.offsetWidth - amp - 8;
    const x = lane * Math.max(0, w - f.offsetWidth);
    f.style.setProperty('--x', `${Math.round(Math.max(amp, Math.min(x, room)))}px`);
  }

  function tick() {
    if (document.hidden || !sheet.hidden || !pool.length || alive >= MAX_ON_SCREEN) return;
    makeFloater(pool[cursor % pool.length]);
    cursor++;
  }

  function startFloating(items) {
    pool = items.slice().reverse(); // oldest first, then loops
    if (reduced || !pool.length || timer) return;
    tick();
    timer = setInterval(tick, EVERY_MS);
  }

  // Bop on the beat: scale bubbles with the engine's pulse while playing.
  let lastBop = '';
  (function bopLoop() {
    const v = (1 + Math.min(0.12, (state.pulse || 0) * 0.1 * (audio.paused ? 0 : 1))).toFixed(3);
    if (v !== lastBop) { lastBop = v; floaters.style.setProperty('--bop', v); }
    requestAnimationFrame(bopLoop);
  })();

  if (demo) {
    const tag = document.createElement('div');
    tag.className = 'demo-tag'; tag.textContent = 'DEMO COMMENTS';
    document.body.append(tag);
  }

  // Load the comments for floating once the counts are in.
  async function loadFloaters() {
    let items = [];
    if (comments > 0) {
      try { items = (await fetch(`/api/comments?id=${id}`, { cache: 'no-store' }).then((r) => r.json())).comments || []; } catch {}
    }
    if (demo) items = [...items, ...DEMO];
    startFloating(items);
  }
  window.__pulseFloat = { add(c) { pool.unshift(c); if (!reduced) makeFloater(c, true); if (!timer && !reduced) startFloating(pool.slice().reverse()); } };
})();

// ───────────────────────── report ─────────────────────────
(() => {
  const sheet = $('reportSheet'), form = $('reportForm'), err = $('rError');
  const showErr = (m) => { err.textContent = m || ''; err.hidden = !m; };
  $('reportBtn').addEventListener('click', () => { showErr(''); sheet.hidden = false; });
  sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('[data-close]')) sheet.hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) sheet.hidden = true; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const reason = (form.querySelector('input[name=reason]:checked') || {}).value;
    if (!reason) { showErr('Pick a reason'); return; }
    showErr('');
    $('rSend').disabled = true;
    try {
      const res = await fetch(`/api/report?id=${encodeURIComponent(data.id)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason, details: $('rDetails').value, contact: $('rContact').value.trim() }),
      });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) { showErr(r.error || 'Could not send the report'); return; }
      sheet.hidden = true;
      form.reset();
      toast('Thanks, your report was sent to the PulsePic team.');
    } catch { showErr('Could not send. Check your connection.'); }
    finally { $('rSend').disabled = false; }
  });
})();
