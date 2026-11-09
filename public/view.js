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
