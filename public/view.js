// Share page: plays a shared song with the creator's picture and effects.
'use strict';

const data = JSON.parse($('pulse-data').textContent);

engine.areaHeight = () => $('card').getBoundingClientRect().top;
engine.onFrame = () => updateTime();

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
