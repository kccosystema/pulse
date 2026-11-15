// Artist page player: tap a song (or the big play button) to hear it right
// here. The header turns into that song's live pulsing visual, with the
// creator's effects, pictures and clips. Songs play one after another.
'use strict';

const page = JSON.parse($('artist-data').textContent);
const byId = Object.fromEntries(page.songs.map((s) => [s.id, s]));
const hero = $('hero');
const cache = new Map();      // id → song data (promise)
let queue = [], qi = -1, current = null, loadToken = 0, shuffle = false;

// The visual fills the header, leaving room at the bottom for the title.
engine.areaHeight = () => hero.clientHeight - 58;
state.showCredits = false;

const songData = (id) => {
  if (!cache.has(id)) {
    cache.set(id, fetch(`/api/view?id=${encodeURIComponent(id)}&format=json`).then((r) => { if (!r.ok) throw new Error('song'); return r.json(); }));
  }
  return cache.get(id);
};

// Same setup as the song's own share page.
function applySong(data) {
  const st = data.settings || {};
  state.fx = st.fx || {};
  state.intensity = st.intensity ?? 0.45;
  state.sensitivity = st.sensitivity ?? 0.55;
  state.mode = st.mode || 'beat';
  state.switchEvery = st.switchEvery || 'beat';
  state.transition = st.transition || 'cut';
  if (typeof st.transitionLen === 'number') state.transitionLen = st.transitionLen;
  state.audioDelay = (data.audio && data.audio.delay) || 0;
  const a = data.analysis;
  state.analysis = a ? {
    bpm: a.bpm,
    beats: a.beats.map(([t, s, d]) => ({ t, s, down: !!d })),
    kicks: a.kicks.map(([t, z]) => ({ t, z })),
    hits: a.hits.map(([t, z]) => ({ t, z })),
  } : null;
  // Pictures and clips: the cover straight away, then the full mix.
  engine.setImages([]);
  state.img = null; state.bgBlur = null; state.channels = null;
  const token = loadToken;
  const many = Array.isArray(data.images) && (data.images.length > 1 || data.images.some((x) => x.kind === 'video'));
  const list = many ? data.images : [data.image];
  const loaded = new Array(list.length).fill(null);
  const cover = new Image();
  cover.onload = () => { if (token === loadToken && !state.img) engine.setImages([cover]); };
  cover.src = data.image.url;
  const ready = () => { if (token === loadToken && loaded.every(Boolean) && many) engine.setImages(loaded); };
  list.forEach((p, i) => {
    if (p.kind === 'video') {
      const v = document.createElement('video');
      v.muted = true; v.defaultMuted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
      v.preload = 'auto';
      v.addEventListener('loadeddata', () => { loaded[i] = { video: v, crop: p.crop, dur: p.duration }; ready(); }, { once: true });
      v.addEventListener('error', () => { loaded[i] = cover; ready(); }, { once: true });
      v.src = p.url; v.load();
    } else {
      const im = new Image();
      im.onload = () => { loaded[i] = im; if (!many && i === 0 && token === loadToken) engine.setImages([im]); ready(); };
      im.onerror = () => { loaded[i] = cover; ready(); };
      im.src = p.url;
    }
  });
}

// Web Audio needs CORS; if the store doesn't send it, go through /api/media.
let usedProxy = false;
audio.addEventListener('error', () => {
  if (!current || usedProxy || !audio.src) return;
  usedProxy = true;
  audio.src = `/api/media?u=${encodeURIComponent(current.audio.url)}`;
  audio.play().catch(() => {});
});

async function playSong(id) {
  const token = ++loadToken;
  const s = byId[id];
  initAudio();
  try { await actx.resume(); } catch {}
  showNow(s);
  let data;
  try { data = await songData(id); } catch { if (token === loadToken) { toast('Could not load that song'); next(); } return; }
  if (token !== loadToken) return;
  current = data;
  usedProxy = false;
  audio.pause();
  applySong(data);
  audio.src = data.audio.url;
  audio.currentTime = 0;
  heard = 0; lastT = null; counted = jammedToday(id);
  play();
}

function showNow(s) {
  hero.classList.add('playing');
  $('nowLine').hidden = false;
  $('heroTitle').textContent = s.title;
  $('nowBar').hidden = false;
  $('nbImg').src = s.image;
  $('nbTitle').textContent = s.title;
  $('nbOpen').href = `/s/${s.id}`;
  document.querySelectorAll('.track, .release').forEach((el) => el.classList.toggle('current', el.querySelector('[data-id]')?.dataset.id === s.id));
  if ('mediaSession' in navigator) {
    try { navigator.mediaSession.metadata = new MediaMetadata({ title: s.title, artist: page.name, artwork: [{ src: s.image, sizes: '512x512' }] }); } catch {}
  }
}

function startQueue(ids, startId) {
  queue = ids.slice();
  if (shuffle) {
    for (let i = queue.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [queue[i], queue[j]] = [queue[j], queue[i]]; }
    if (startId) { queue.splice(queue.indexOf(startId), 1); queue.unshift(startId); }
  }
  qi = startId ? queue.indexOf(startId) : 0;
  playSong(queue[qi]);
}
function next() {
  if (!queue.length) return;
  qi = (qi + 1) % queue.length;
  playSong(queue[qi]);
}

// Tapping a song plays it, then carries on down that list.
document.querySelectorAll('.play-row').forEach((b) => b.addEventListener('click', () => {
  const list = b.dataset.list === 'releases' ? page.songs.map((s) => s.id) : page.popular;
  startQueue(list, b.dataset.id);
}));
$('bigPlay').addEventListener('click', () => {
  if (!current) { startQueue(page.popular); return; }
  if (audio.paused) play(); else audio.pause();
});
$('nbPlay').addEventListener('click', () => (audio.paused ? play() : audio.pause()));
$('nbNext').addEventListener('click', next);
$('shuffleBtn').addEventListener('click', () => {
  shuffle = !shuffle;
  $('shuffleBtn').setAttribute('aria-pressed', String(shuffle));
  toast(shuffle ? 'Shuffle on' : 'Shuffle off');
});
audio.addEventListener('ended', next);
const setIcons = () => {
  const on = !audio.paused;
  $('bigIcon').textContent = on ? '❚❚' : '▶';
  $('bigPlay').classList.toggle('on', on);
  $('bigPlay').setAttribute('aria-label', on ? 'Pause' : 'Play');
  $('nbPlay').textContent = on ? '❚❚' : '▶';
  $('nbPlay').setAttribute('aria-label', on ? 'Pause' : 'Play');
};
audio.addEventListener('play', setIcons);
audio.addEventListener('pause', setIcons);
engine.onFrame = () => {
  if (current && audio.duration) $('nbProgress').style.width = `${(audio.currentTime / audio.duration) * 100}%`;
};
if ('mediaSession' in navigator) {
  try {
    navigator.mediaSession.setActionHandler('nexttrack', next);
    navigator.mediaSession.setActionHandler('play', () => play());
    navigator.mediaSession.setActionHandler('pause', () => audio.pause());
  } catch {}
}

// Jams: same rule as share pages (5 s heard, once per browser per day per song).
const today = () => new Date().toISOString().slice(0, 10);
const jammedToday = (id) => { try { return localStorage.getItem(`pulse:jam:${id}`) === today(); } catch { return false; } };
let heard = 0, lastT = null, counted = false;
audio.addEventListener('timeupdate', () => {
  if (!current || counted || audio.paused) { lastT = null; return; }
  const t = audio.currentTime;
  if (lastT !== null && t > lastT && t - lastT < 1.5) heard += t - lastT;
  lastT = t;
  if (heard < 5) return;
  counted = true;
  const id = current.id;
  try { localStorage.setItem(`pulse:jam:${id}`, today()); } catch {}
  fetch(`/api/plays?id=${encodeURIComponent(id)}`, { method: 'POST' })
    .then((r) => r.json())
    .then((r) => {
      if (!r.enabled) return;
      document.querySelectorAll(`.track[data-id="${CSS.escape(id)}"] .jams`).forEach((el) => { el.textContent = Number(r.plays).toLocaleString('en-US'); });
    })
    .catch(() => {});
});
audio.addEventListener('seeking', () => { lastT = null; });

// Popular: first 5, then Show more. About: long bios fold.
const more = $('showMore');
if (more) more.addEventListener('click', () => { $('popular').classList.toggle('all'); more.textContent = $('popular').classList.contains('all') ? 'Show less' : 'Show more'; });
const bio = $('bio');
if (bio) {
  requestAnimationFrame(() => { if (bio.scrollHeight > bio.clientHeight + 2) $('bioMore').hidden = false; });
  $('bioMore').addEventListener('click', () => { bio.classList.toggle('open'); $('bioMore').textContent = bio.classList.contains('open') ? 'show less' : 'show more'; });
}
$('shareArtist').addEventListener('click', async () => {
  if (navigator.share) { try { await navigator.share({ title: page.name, url: page.url }); } catch {} return; }
  try { await navigator.clipboard.writeText(page.url); toast('Link copied'); } catch { toast(page.url); }
});
