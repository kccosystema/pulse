// Pulse — makes an image pulse to the beat of a song.
// Everything runs on the phone: files never leave the device.
'use strict';

const $ = (id) => document.getElementById(id);
const canvas = $('stage');
const ctx = canvas.getContext('2d');
const audio = $('audio');

const state = {
  img: null,        // HTMLImageElement
  bgBlur: null,     // tiny canvas used as a cheap blurred backdrop
  audioURL: null,
  imageURL: null,
  fx: { glow: true, shake: false, flash: false, round: false },
  intensity: 0.45,
  sensitivity: 0.55,
  pulse: 0,         // 0..1 envelope, kicked on each beat
  level: 0,         // smoothed bass level 0..1
  hue: 330,
  recorder: null,
};

// ───────────────────────── file pickers ─────────────────────────

$('imageInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (state.imageURL) URL.revokeObjectURL(state.imageURL);
  state.imageURL = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    state.img = img;
    state.bgBlur = makeBlur(img);
    $('imageThumb').style.backgroundImage = `url("${state.imageURL}")`;
    $('imageThumb').textContent = '';
    $('imageName').textContent = file.name;
    $('pickImage').classList.add('done');
    updateStart();
  };
  img.onerror = () => toast('Could not open that image');
  img.src = state.imageURL;
});

$('audioInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (state.audioURL) URL.revokeObjectURL(state.audioURL);
  state.audioURL = URL.createObjectURL(file);
  audio.src = state.audioURL;
  $('audioName').textContent = file.name;
  $('pickAudio').classList.add('done');
  updateStart();
});

function updateStart() { $('startBtn').disabled = !(state.img && state.audioURL); }

// Downscale to a tiny canvas; drawing it back up big gives a soft blur that
// works everywhere (Safari has no ctx.filter).
function makeBlur(img) {
  const c = document.createElement('canvas');
  const s = 24 / Math.max(img.width, img.height);
  c.width = Math.max(1, Math.round(img.width * s));
  c.height = Math.max(1, Math.round(img.height * s));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

// ───────────────────────── audio graph ─────────────────────────

let actx, analyser, freq, recDest;

function initAudio() {
  if (actx) return;
  // iOS: play through the ringer/silent switch like a music app.
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
  const AC = window.AudioContext || window.webkitAudioContext;
  actx = new AC();
  const src = actx.createMediaElementSource(audio);
  analyser = actx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.0;
  freq = new Uint8Array(analyser.frequencyBinCount);
  src.connect(analyser);
  analyser.connect(actx.destination);
  if (actx.createMediaStreamDestination) {
    recDest = actx.createMediaStreamDestination();
    analyser.connect(recDest);
  }
}

// ───────────────────────── beat detection ─────────────────────────
// Energy in the bass band (~40–160 Hz) compared with its recent average.
// A beat fires when the current energy jumps well above the local mean.

const HISTORY = 43;            // ~0.7 s of frames at 60 fps
const hist = new Float32Array(HISTORY);
let histI = 0, histN = 0, lastBeat = 0, prevEnergy = 0;

function detect(now) {
  analyser.getByteFrequencyData(freq);
  const binHz = actx.sampleRate / analyser.fftSize;
  const lo = Math.max(1, Math.floor(40 / binHz));
  const hi = Math.max(lo + 1, Math.ceil(160 / binHz));
  let sum = 0;
  for (let i = lo; i <= hi; i++) sum += freq[i] * freq[i];
  const energy = sum / ((hi - lo + 1) * 65025); // 0..1

  let mean = 0;
  for (let i = 0; i < histN; i++) mean += hist[i];
  mean = histN ? mean / histN : energy;
  let variance = 0;
  for (let i = 0; i < histN; i++) variance += (hist[i] - mean) ** 2;
  variance = histN ? variance / histN : 0;

  hist[histI] = energy;
  histI = (histI + 1) % HISTORY;
  histN = Math.min(histN + 1, HISTORY);

  // Higher sensitivity → lower threshold multiplier.
  const C = 1.55 - state.sensitivity * 0.5 + Math.min(0.15, variance * 4);
  const rising = energy > prevEnergy;
  prevEnergy = energy;

  state.level += (Math.min(1, energy * 1.6) - state.level) * 0.25;

  if (histN > 8 && rising && energy > mean * C && energy > 0.02 && now - lastBeat > 140) {
    lastBeat = now;
    const strength = Math.min(1, (energy / (mean || 1e-3) - 1) * 1.5 + 0.35);
    state.pulse = Math.max(state.pulse, strength);
    state.hue = (state.hue + 25) % 360;
    return true;
  }
  return false;
}

// ───────────────────────── rendering ─────────────────────────

let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
}
window.addEventListener('resize', resize);
resize();

let flash = 0, lastT = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  if (actx && !audio.paused) {
    if (detect(now) && state.fx.flash) flash = 1;
  } else {
    state.level *= 0.9;
  }
  // Exponential decay of the beat envelope (~140 ms).
  state.pulse *= Math.exp(-dt / 0.14);
  flash *= Math.exp(-dt / 0.08);

  draw();
  updateTime();
  requestAnimationFrame(frame);
}

function draw() {
  const c = ctx;
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.fillStyle = '#0b0b10';
  c.fillRect(0, 0, W, H);
  if (!state.img) { drawIdle(); return; }

  const img = state.img;
  const k = state.intensity;
  const scale = 1 + k * (0.28 * state.pulse + 0.06 * state.level);

  // Backdrop: blurred cover-fit image that breathes a little with the bass.
  if (state.bgBlur) {
    const b = state.bgBlur;
    const cover = Math.max(W / b.width, H / b.height) * (1.15 + 0.08 * k * state.pulse);
    const bw = b.width * cover, bh = b.height * cover;
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.globalAlpha = 0.55 + 0.25 * state.pulse * k;
    c.drawImage(b, (W - bw) / 2, (H - bh) / 2, bw, bh);
    c.globalAlpha = 1;
    c.fillStyle = 'rgba(11,11,16,0.45)';
    c.fillRect(0, 0, W, H);
  }

  // Foreground: contain-fit, then scaled around the centre.
  // Fit into the space above the control panel (whole screen when hidden or recording).
  const panel = $('player');
  const showing = !panel.hidden && !panel.classList.contains('hidden-ui') && !state.recorder;
  const areaH = showing ? Math.max(H * 0.4, panel.getBoundingClientRect().top) : H;
  const pad = 0.8;
  const fit = Math.min((W * pad) / img.width, (areaH * pad) / img.height);
  const w = img.width * fit, h = img.height * fit;
  let cx = W / 2, cy = areaH / 2;
  if (state.fx.shake && state.pulse > 0.05) {
    const s = 14 * k * state.pulse;
    cx += (Math.random() * 2 - 1) * s;
    cy += (Math.random() * 2 - 1) * s;
  }

  c.save();
  c.translate(cx, cy);
  c.scale(scale, scale);

  const r = state.fx.round ? Math.min(w, h) / 2 : Math.min(w, h) * 0.04;
  if (state.fx.glow) {
    c.shadowColor = `hsla(${state.hue}, 95%, 60%, ${0.35 + 0.6 * state.pulse})`;
    c.shadowBlur = 20 + 90 * state.pulse * (0.4 + k);
  }
  roundRect(c, -w / 2, -h / 2, w, h, r);
  c.fillStyle = '#000';
  c.fill();
  c.shadowBlur = 0;
  c.clip();
  if (state.fx.round) {
    // Cover-fit inside the circle.
    const d = Math.min(w, h);
    const s2 = Math.max(d / img.width, d / img.height);
    c.drawImage(img, -img.width * s2 / 2, -img.height * s2 / 2, img.width * s2, img.height * s2);
  } else {
    c.drawImage(img, -w / 2, -h / 2, w, h);
  }
  c.restore();

  if (flash > 0.02) {
    c.fillStyle = `rgba(255,255,255,${0.35 * flash * (0.4 + k)})`;
    c.fillRect(0, 0, W, H);
  }
}

function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function drawIdle() {
  const t = performance.now() / 1000;
  const r = Math.min(W, H) * (0.18 + 0.02 * Math.sin(t * 2.2));
  const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, r * 2.4);
  g.addColorStop(0, 'rgba(255,61,127,0.35)');
  g.addColorStop(0.5, 'rgba(124,92,255,0.12)');
  g.addColorStop(1, 'rgba(11,11,16,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

requestAnimationFrame(frame);

// ───────────────────────── controls ─────────────────────────

$('startBtn').addEventListener('click', async () => {
  initAudio();
  await actx.resume();
  $('setup').hidden = true;
  $('player').hidden = false;
  play();
});

function play() {
  if (actx && actx.state !== 'running') actx.resume();
  audio.play().catch(() => toast('Tap ▶ to play'));
}

$('playBtn').addEventListener('click', () => (audio.paused ? play() : audio.pause()));
audio.addEventListener('play', () => { $('playBtn').textContent = '❚❚'; $('playBtn').ariaLabel = 'Pause'; });
audio.addEventListener('pause', () => { $('playBtn').textContent = '▶'; $('playBtn').ariaLabel = 'Play'; });
audio.addEventListener('ended', () => { if (state.recorder) stopRecording(); });

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

$('intensity').addEventListener('input', (e) => { state.intensity = e.target.value / 100; save(); });
$('sensitivity').addEventListener('input', (e) => { state.sensitivity = e.target.value / 100; save(); });

document.querySelectorAll('.chip').forEach((b) => {
  b.addEventListener('click', () => {
    const k = b.dataset.fx;
    state.fx[k] = !state.fx[k];
    b.classList.toggle('on', state.fx[k]);
    save();
  });
});

// Hide controls for a clean full-screen view; tap anywhere to bring them back.
$('hideBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  $('player').classList.add('hidden-ui');
  toast('Tap the screen to show controls');
});
canvas.addEventListener('click', () => $('player').classList.remove('hidden-ui'));

$('newBtn').addEventListener('click', () => {
  if (state.recorder) stopRecording();
  audio.pause();
  $('player').hidden = true;
  $('setup').hidden = false;
});

// ───────────────────────── recording ─────────────────────────
// Records the canvas + song to a video you can save or share.

function pickMime() {
  const types = ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
}

$('recordBtn').addEventListener('click', () => (state.recorder ? stopRecording() : startRecording()));

function startRecording() {
  if (!canvas.captureStream || !window.MediaRecorder || !recDest) {
    toast('Video recording is not supported in this browser');
    return;
  }
  const stream = canvas.captureStream(30);
  recDest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  const mimeType = pickMime();
  let rec;
  try {
    rec = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 6_000_000 } : undefined);
  } catch {
    toast('Could not start recording');
    return;
  }
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.onstop = () => {
    stream.getVideoTracks().forEach((t) => t.stop());
    const type = rec.mimeType || mimeType || 'video/webm';
    finishVideo(new Blob(chunks, { type }), type);
  };
  state.recorder = rec;
  audio.currentTime = 0;
  rec.start(1000);
  play();
  $('recordBtn').textContent = '■ Stop';
  $('recordBtn').classList.add('rec');
  toast('Recording… plays to the end, or tap Stop');
}

function stopRecording() {
  const rec = state.recorder;
  state.recorder = null;
  $('recordBtn').textContent = '● Record';
  $('recordBtn').classList.remove('rec');
  if (rec && rec.state !== 'inactive') rec.stop();
  audio.pause();
}

async function finishVideo(blob, type) {
  const ext = type.includes('mp4') ? 'mp4' : 'webm';
  const file = new File([blob], `pulse-${Date.now()}.${ext}`, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Pulse' }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  toast('Video saved');
}

// ───────────────────────── misc ─────────────────────────

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2600);
}

function save() {
  try {
    localStorage.setItem('pulse:settings', JSON.stringify({ fx: state.fx, intensity: state.intensity, sensitivity: state.sensitivity }));
  } catch {}
}
(function load() {
  try {
    const s = JSON.parse(localStorage.getItem('pulse:settings'));
    if (!s) return;
    Object.assign(state.fx, s.fx);
    state.intensity = s.intensity ?? state.intensity;
    state.sensitivity = s.sensitivity ?? state.sensitivity;
    $('intensity').value = Math.round(state.intensity * 100);
    $('sensitivity').value = Math.round(state.sensitivity * 100);
    document.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', !!state.fx[b.dataset.fx]));
  } catch {}
})();

// Resume audio if iOS suspended the context while the app was in the background.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && actx && actx.state !== 'running' && !audio.paused) actx.resume();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
