// PulsePic engine: audio, beat timeline, effects and rendering.
// Shared by the creator (app.js) and the share page (view.js).
// Pages set hooks on `engine` and call the functions below.
'use strict';

const $ = (id) => document.getElementById(id);
const canvas = $('stage');
const ctx = canvas.getContext('2d');
const audio = $('audio');

const engine = {
  // Height (CSS px) of the area the picture should sit in; pages override.
  areaHeight: () => H,
  onFrame: () => {},
  onRecordChange: () => {},
};

const state = {
  img: null,
  bgBlur: null,
  channels: null,   // red/green/blue copies of the image, for the RGB split
  audioURL: null,
  imageURL: null,
  fx: { glow: true },
  intensity: 0.45,
  sensitivity: 0.55,
  offset: 0,        // ms; positive delays the visuals (e.g. Bluetooth headphones)
  mode: 'beat',     // 'beat' | 'kick' | 'hits'
  analysis: null,
  analyzing: false,
  pulse: 0,
  level: 0,
  hue: 330,
  tiltDir: 1,
  recorder: null,
  credits: null,     // { title, artist, album } drawn under the picture
  audioDelay: 0,     // s of silence an MP3 encoder added before the song (share page)
  showCredits: true,
};

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

// Pure red, green and blue copies of the image; added back together with
// small offsets they give the chromatic "RGB split" look.
function makeChannels(img) {
  const s = Math.min(1, 1024 / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s));
  return ['#f00', '#0f0', '#00f'].map((color) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, w, h);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(img, 0, 0, w, h);
    return c;
  });
}

// ───────────────────────── song analysis ─────────────────────────

async function decode(buf) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OAC) throw new Error('no OfflineAudioContext');
  let c;
  try { c = new OAC(1, 1, 22050); } catch { c = new OAC(1, 1, 44100); }
  return new Promise((resolve, reject) => {
    const p = c.decodeAudioData(buf, resolve, reject);
    if (p && p.then) p.then(resolve, reject);
  });
}

function mixdown(ab) {
  const n = ab.length, ch = ab.numberOfChannels;
  const out = new Float32Array(n);
  for (let c = 0; c < ch; c++) {
    const d = ab.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += d[i] / ch;
  }
  return out;
}

function runWorker(samples, sampleRate, onProgress) {
  return new Promise((resolve, reject) => {
    const w = new Worker('/beat-worker.js');
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') onProgress(m.p);
      else if (m.type === 'done') { w.terminate(); resolve(m.result); }
      else if (m.type === 'error') { w.terminate(); reject(new Error(m.message)); }
    };
    w.onerror = (e) => { w.terminate(); reject(e); };
    w.postMessage({ samples, sampleRate }, [samples.buffer]);
  });
}

function prepare(r) {
  return {
    bpm: r.bpm,
    beats: r.beats.map((t, i) => ({ t, s: r.beatStrength[i], down: (i - r.downPhase) % 4 === 0 })),
    kicks: r.kicks.map(([t, z]) => ({ t, z })),
    hits: r.hits.map(([t, z]) => ({ t, z })),
  };
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

// ───────────────────────── playback clock ─────────────────────────
// audio.currentTime only updates every few frames on some browsers, so keep a
// smooth clock that runs on performance.now() and is gently pulled back to it.

const clock = { media: 0, perf: 0, lastCt: -1 };
function resetClock() {
  clock.media = audio.currentTime;
  clock.perf = performance.now();
  clock.lastCt = audio.currentTime;
}
function mediaTime(now) {
  if (audio.paused) { resetClock(); return clock.media; }
  const rate = audio.playbackRate || 1;
  const ct = audio.currentTime;
  if (ct !== clock.lastCt) {
    clock.lastCt = ct;
    const err = ct - (clock.media + ((now - clock.perf) / 1000) * rate);
    if (Math.abs(err) > 0.08) { clock.media = ct; clock.perf = now; }
    else clock.media += err * 0.15;
  }
  return clock.media + ((now - clock.perf) / 1000) * rate;
}
['play', 'seeked', 'playing'].forEach((ev) => audio.addEventListener(ev, resetClock));

// What the listener is hearing right now, in song time.
function heardTime(now) {
  const lat = actx ? Math.min(0.5, (actx.outputLatency || 0) + (actx.baseLatency || 0)) : 0;
  return mediaTime(now) - lat - state.offset / 1000 - state.audioDelay + 0.012; // +12 ms ≈ one frame to reach the screen
}

// ───────────────────────── beat events ─────────────────────────

let evIdx = 0, lastHeard = -1, lastEvents = null;

function currentEvents() {
  const a = state.analysis;
  if (!a) return null;
  return state.mode === 'kick' ? a.kicks : state.mode === 'hits' ? a.hits : a.beats;
}

// Kick/hit z-score needed to count; higher sensitivity → lower bar.
const zThreshold = () => 2.6 - state.sensitivity * 2.2;

function firstAfter(evs, t) {
  let lo = 0, hi = evs.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (evs[m].t <= t) lo = m + 1; else hi = m; }
  return lo;
}

function dispatch(t, now) {
  const evs = currentEvents();
  if (!evs) return;
  if (evs !== lastEvents || t < lastHeard - 0.05 || t > lastHeard + 0.5) {
    evIdx = firstAfter(evs, t);
    lastEvents = evs;
  }
  lastHeard = t;
  while (evIdx < evs.length && evs[evIdx].t <= t) {
    const ev = evs[evIdx++];
    if (t - ev.t > 0.12) continue; // stale (tab was hidden, etc.)
    if (ev.z !== undefined) {
      if (ev.z < zThreshold()) continue;
      fire(Math.min(1, 0.45 + ev.z * 0.15), ev.z > 3.2, now);
    } else {
      fire(ev.s, ev.down, now);
    }
  }
}

// Fallback: live bass-energy detector, used only when analysis failed.
const HISTORY = 43;
const hist = new Float32Array(HISTORY);
let histI = 0, histN = 0, lastBeat = 0, prevEnergy = 0;

function detectLive(now) {
  analyser.getByteFrequencyData(freq);
  const binHz = actx.sampleRate / analyser.fftSize;
  const lo = Math.max(1, Math.floor(40 / binHz));
  const hi = Math.max(lo + 1, Math.ceil(160 / binHz));
  let sum = 0;
  for (let i = lo; i <= hi; i++) sum += freq[i] * freq[i];
  const energy = sum / ((hi - lo + 1) * 65025);
  let mean = 0;
  for (let i = 0; i < histN; i++) mean += hist[i];
  mean = histN ? mean / histN : energy;
  hist[histI] = energy;
  histI = (histI + 1) % HISTORY;
  histN = Math.min(histN + 1, HISTORY);
  const C = 1.55 - state.sensitivity * 0.5;
  const rising = energy > prevEnergy;
  prevEnergy = energy;
  if (histN > 8 && rising && energy > mean * C && energy > 0.02 && now - lastBeat > 140) {
    lastBeat = now;
    fire(Math.min(1, (energy / (mean || 1e-3) - 1) * 1.5 + 0.35), false, now);
  }
}

// ───────────────────────── effects state ─────────────────────────

let flash = 0, strobe = 0;
const rings = [], echoes = [], sparks = [];
const bars = new Float32Array(48);

function fire(s, down, now) {
  state.pulse = Math.max(state.pulse, down ? s : s * 0.85);
  state.hue = (state.hue + (down ? 60 : 25)) % 360;
  state.tiltDir = -state.tiltDir;
  const fx = state.fx;
  if (fx.flash) flash = Math.max(flash, s);
  if (fx.strobe && down) strobe = 1;
  if (fx.rings) rings.push({ t: now, hue: state.hue, s });
  if (fx.echo) echoes.push({ t: now, s });
  if (fx.sparks) emitSparks(s, down);
  if (rings.length > 8) rings.shift();
  if (echoes.length > 4) echoes.shift();
}

let layout = { cx: 0, cy: 0, w: 0, h: 0 };
function emitSparks(s, down) {
  const n = Math.round((down ? 40 : 22) * (0.5 + state.intensity));
  const { cx, cy, w, h } = layout;
  for (let i = 0; i < n && sparks.length < 400; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = (180 + Math.random() * 420) * U * (0.6 + state.intensity) * s;
    sparks.push({
      x: cx + Math.cos(a) * w * 0.5, y: cy + Math.sin(a) * h * 0.5,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      life: 0, max: 0.5 + Math.random() * 0.7,
      size: (1.5 + Math.random() * 3.5) * U,
      hue: (state.hue + Math.random() * 60 - 30 + 360) % 360,
    });
  }
}

// ───────────────────────── rendering ─────────────────────────

// Drawing normally goes to the on-screen canvas; video export swaps in an
// off-screen 1080p canvas (setRenderTarget). U scales pixel sizes (sparks,
// text, line widths) so a 1080-wide video looks like the phone screen.
let W = 0, H = 0, DPR = 1, U = 1;
let rc = ctx;            // current render context
let exportCanvas = null; // set while exporting
let glowScale = 1;       // shadowBlur ignores transforms; keep glow proportional

function setRenderTarget(cnv) {
  rings.length = 0; echoes.length = 0; sparks.length = 0; // positions are per-target
  if (cnv) {
    exportCanvas = cnv;
    rc = cnv.getContext('2d');
    W = cnv.width; H = cnv.height; DPR = 1;
    U = Math.min(W, H) / 390;
    glowScale = U * 2;    // match a 2× phone screen
  } else {
    exportCanvas = null;
    rc = ctx;
    resize();
  }
}

function resize() {
  if (exportCanvas) return;
  U = 1;
  glowScale = 1;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
}
window.addEventListener('resize', resize);
resize();

let lastFrame = performance.now();
let offline = false; // true while a fast export drives the frames itself

function decay(dt) {
  state.pulse *= Math.exp(-dt / 0.14);
  flash *= Math.exp(-dt / 0.08);
  strobe *= Math.exp(-dt / 0.05);
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (offline) { requestAnimationFrame(frame); return; }

  if (actx && !audio.paused) {
    if (state.analysis) dispatch(heardTime(now), now);
    else detectLive(now);
    updateLevels();
  } else {
    state.level *= 0.9;
    for (let i = 0; i < bars.length; i++) bars[i] *= 0.9;
  }
  decay(dt);

  draw(now, dt);
  engine.onFrame();
  requestAnimationFrame(frame);
}

// Bass level (for a gentle continuous breathing) and spectrum bars.
function updateLevels() {
  analyser.getByteFrequencyData(freq);
  levelsFrom(freq, actx.sampleRate / analyser.fftSize);
}

// Shared by live playback (analyser bytes) and fast export (precomputed bytes).
function levelsFrom(freq, binHz) {
  let bass = 0, nb = 0;
  for (let i = Math.max(1, Math.floor(40 / binHz)); i <= Math.ceil(160 / binHz); i++) { bass += freq[i]; nb++; }
  state.level += (Math.min(1, bass / nb / 255) - state.level) * 0.2;
  if (!state.fx.bars) return;
  const n = bars.length, fMin = 40, fMax = 12000;
  for (let b = 0; b < n; b++) {
    const lo = Math.floor((fMin * Math.pow(fMax / fMin, b / n)) / binHz);
    const hi = Math.max(lo + 1, Math.floor((fMin * Math.pow(fMax / fMin, (b + 1) / n)) / binHz));
    let m = 0;
    for (let k = lo; k < hi && k < freq.length; k++) if (freq[k] > m) m = freq[k];
    const v = Math.pow(m / 255, 1.6);
    bars[b] = v > bars[b] ? v : bars[b] * 0.85;
  }
}

function draw(now, dt) {
  const c = rc;
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.globalCompositeOperation = 'source-over';
  c.fillStyle = '#0b0b10';
  c.fillRect(0, 0, W, H);
  if (!state.img) { drawIdle(); return; }

  const img = state.img;
  const fx = state.fx;
  const k = state.intensity;
  const p = state.pulse;

  // Backdrop: blurred cover-fit image that breathes a little with the beat.
  if (state.bgBlur) {
    const b = state.bgBlur;
    const cover = Math.max(W / b.width, H / b.height) * (1.15 + 0.08 * k * p);
    const bw = b.width * cover, bh = b.height * cover;
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.globalAlpha = 0.55 + 0.25 * p * k;
    c.drawImage(b, (W - bw) / 2, (H - bh) / 2, bw, bh);
    c.globalAlpha = 1;
    c.fillStyle = 'rgba(11,11,16,0.45)';
    c.fillRect(0, 0, W, H);
  }

  // Fit into the page's picture area (the whole screen while recording),
  // leaving room underneath for the song credits when they are shown.
  const areaH = exportCanvas ? H : Math.max(H * 0.35, Math.min(H, engine.areaHeight()));
  const credits = state.showCredits && state.credits && (state.credits.title || state.credits.artist) ? state.credits : null;
  const font = creditFont();
  const creditH = credits ? 18 + font.big * 1.25 + (credits.artist || credits.album ? font.small * 1.3 : 0) + 8 : 0;
  const boxH = areaH - creditH;
  const pad = 0.78;
  const fit = Math.min((W * pad) / img.width, (boxH * (credits ? 0.84 : pad)) / img.height);
  let w = img.width * fit, h = img.height * fit;
  if (fx.round) { const d = Math.min(w, h); w = h = d; }
  const r = fx.round ? w / 2 : Math.min(w, h) * 0.04;
  // With credits, the picture + text block is centred together in the area.
  const baseCy = credits ? (areaH - creditH - h) / 2 + h / 2 + Math.max(0, (boxH - h) * 0.1) : areaH / 2;

  let cx = W / 2, cy = baseCy;
  if (fx.bounce) cy -= h * 0.12 * k * p;
  if (fx.shake && p > 0.05) {
    const s = 16 * U * k * p;
    cx += (Math.random() * 2 - 1) * s;
    cy += (Math.random() * 2 - 1) * s;
  }
  const scale = 1 + k * (0.28 * p + 0.06 * state.level);
  const rot = fx.tilt ? state.tiltDir * k * 0.12 * p : 0;
  layout = { cx, cy, w: w * scale, h: h * scale };

  if (fx.bars) drawBars(c, cx, baseCy, w * scale, h * scale, fx.round, areaH);
  if (fx.rings) drawRings(c, now, cx, cy, w * scale, h * scale, r * scale);
  if (fx.echo) drawEchoes(c, now, cx, cy, w, h, r, scale, rot);

  // Main image.
  c.save();
  c.translate(cx, cy);
  c.rotate(rot);
  c.scale(scale, scale);
  if (fx.glow) {
    c.shadowColor = `hsla(${state.hue}, 95%, 60%, ${0.35 + 0.6 * p})`;
    c.shadowBlur = (20 + 90 * p * (0.4 + k)) * glowScale;
  }
  roundRect(c, -w / 2, -h / 2, w, h, r);
  c.fillStyle = '#000';
  c.fill();
  c.shadowBlur = 0;
  c.clip();
  if (fx.rgb && p > 0.04) {
    if (!state.channels) state.channels = makeChannels(img);
    const off = ((4 + 18 * k) * p * U) / scale;
    c.globalCompositeOperation = 'lighter';
    drawSource(c, state.channels[0], -off, -off * 0.3, w, h, fx.round);
    drawSource(c, state.channels[1], 0, 0, w, h, fx.round);
    drawSource(c, state.channels[2], off, off * 0.3, w, h, fx.round);
    c.globalCompositeOperation = 'source-over';
  } else {
    drawSource(c, img, 0, 0, w, h, fx.round);
  }
  c.restore();

  if (credits) drawCredits(c, credits, baseCy + h / 2 + 18 * U, font);
  if (exportCanvas && engine.watermark) drawWatermark(c, credits ? baseCy + h / 2 + 18 * U + font.big * 1.25 + font.small * 1.3 + 14 * U : baseCy + h / 2 + 22 * U);
  if (sparks.length) drawSparks(c, dt);

  if (flash > 0.02) {
    c.fillStyle = `rgba(255,255,255,${0.35 * flash * (0.4 + k)})`;
    c.fillRect(0, 0, W, H);
  }
  if (strobe > 0.03) {
    c.globalCompositeOperation = 'difference';
    c.fillStyle = `rgba(255,255,255,${Math.min(1, strobe)})`;
    c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'source-over';
  }
}

// Song title / artist / album under the picture (also lands in recorded videos).
// Small "Made with PulsePic" line under the credits in exported videos.
function drawWatermark(c, y) {
  c.save();
  c.textAlign = 'center';
  c.textBaseline = 'top';
  c.font = `600 ${Math.round(11 * U)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.fillText('Made with PulsePic.com', W / 2, Math.min(y, H - 40 * U));
  c.restore();
}

function creditFont() {
  const big = Math.round(Math.max(16 * U, Math.min(30 * U, W * 0.055)));
  return { big, small: Math.round(big * 0.62) };
}

function drawCredits(c, cr, top, { big, small }) {
  const maxW = W * 0.9;
  c.save();
  c.textAlign = 'center';
  c.textBaseline = 'top';
  c.shadowColor = 'rgba(0,0,0,0.6)';
  c.shadowBlur = 8 * glowScale;
  let y = top;
  if (cr.title) {
    c.font = `700 ${big}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    c.fillStyle = '#fff';
    c.fillText(fitText(c, cr.title, maxW), W / 2, y);
    y += big * 1.25;
  }
  const sub = [cr.artist, cr.album].filter(Boolean).join(' · ');
  if (sub) {
    c.font = `500 ${small}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    c.fillStyle = `hsla(${state.hue}, 90%, 82%, 0.95)`;
    c.fillText(fitText(c, sub, maxW), W / 2, y);
  }
  c.restore();
}

function fitText(c, text, maxW) {
  if (c.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && c.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

// Draw an image (contain-fit, or cover-fit for the circle) centred on 0,0.
function drawSource(c, src, dx, dy, w, h, round) {
  if (round) {
    const s = Math.max(w / src.width, h / src.height);
    c.drawImage(src, dx - (src.width * s) / 2, dy - (src.height * s) / 2, src.width * s, src.height * s);
  } else {
    c.drawImage(src, dx - w / 2, dy - h / 2, w, h);
  }
}

// Ghost copies that grow and fade after each beat.
function drawEchoes(c, now, cx, cy, w, h, r, scale, rot) {
  for (let i = echoes.length - 1; i >= 0; i--) {
    const e = echoes[i];
    const age = (now - e.t) / 450;
    if (age >= 1) { echoes.splice(i, 1); continue; }
    const s = scale * (1 + (0.15 + 0.35 * state.intensity) * age);
    c.save();
    c.globalAlpha = 0.45 * (1 - age) * e.s;
    c.translate(cx, cy);
    c.rotate(rot);
    c.scale(s, s);
    roundRect(c, -w / 2, -h / 2, w, h, r);
    c.clip();
    drawSource(c, state.img, 0, 0, w, h, state.fx.round);
    c.restore();
  }
}

// Shockwave outlines that expand from the image on each beat.
function drawRings(c, now, cx, cy, w, h, r) {
  const reach = Math.max(w, h) * (0.35 + 0.5 * state.intensity);
  c.save();
  for (let i = rings.length - 1; i >= 0; i--) {
    const g = rings[i];
    const age = (now - g.t) / 700;
    if (age >= 1) { rings.splice(i, 1); continue; }
    const e = reach * (1 - Math.pow(1 - age, 3));
    c.strokeStyle = `hsla(${g.hue}, 95%, 65%, ${0.85 * (1 - age) * g.s})`;
    c.lineWidth = (2 + 6 * (1 - age)) * U;
    roundRect(c, cx - w / 2 - e, cy - h / 2 - e, w + 2 * e, h + 2 * e, r + e);
    c.stroke();
  }
  c.restore();
}

// Spectrum: radial around the circle, or an equalizer behind the picture.
function drawBars(c, cx, cy, w, h, round, areaH) {
  const n = bars.length;
  const k = state.intensity;
  c.save();
  if (round) {
    const R = w / 2 + 6 * U;
    const total = n * 2;
    c.lineCap = 'round';
    c.lineWidth = Math.max(2, ((2 * Math.PI * R) / total) * 0.55);
    for (let i = 0; i < total; i++) {
      const b = i < n ? i : total - 1 - i;
      const len = 4 + bars[b] * Math.min(W, areaH) * (0.12 + 0.18 * k);
      const a = (i / total) * Math.PI * 2 - Math.PI / 2;
      c.strokeStyle = `hsla(${(state.hue + b * 4) % 360}, 90%, 62%, 0.85)`;
      c.beginPath();
      c.moveTo(layout.cx + Math.cos(a) * R, layout.cy + Math.sin(a) * R);
      c.lineTo(layout.cx + Math.cos(a) * (R + len), layout.cy + Math.sin(a) * (R + len));
      c.stroke();
    }
  } else {
    const total = n * 2;
    const bw = W / total;
    for (let i = 0; i < total; i++) {
      const b = Math.abs(i - (total - 1) / 2) | 0; // low frequencies in the middle
      const v = bars[Math.min(n - 1, b)];
      const bh = h * (0.25 + v * (0.9 + 0.8 * k));
      c.fillStyle = `hsla(${(state.hue + b * 4) % 360}, 90%, 60%, ${0.25 + 0.5 * v})`;
      c.fillRect(i * bw + bw * 0.15, cy - bh / 2, bw * 0.7, bh);
    }
  }
  c.restore();
}

function drawSparks(c, dt) {
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.life += dt;
    if (s.life >= s.max) { sparks.splice(i, 1); continue; }
    s.vx *= 0.97; s.vy = s.vy * 0.97 + 300 * U * dt;
    s.x += s.vx * dt; s.y += s.vy * dt;
    const f = 1 - s.life / s.max;
    c.fillStyle = `hsla(${s.hue}, 100%, 65%, ${f})`;
    c.beginPath();
    c.arc(s.x, s.y, s.size * (0.5 + f * 0.5), 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

function roundRect(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
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

function play() {
  if (actx && actx.state !== 'running') actx.resume();
  audio.play().catch(() => toast('Tap ▶ to play'));
}

// ───────────────────────── recording ─────────────────────────
// Records the canvas + song to a video you can save or share.

// Instagram, TikTok etc. want MP4 (H.264 + AAC). Safari records that; Chrome
// does on recent versions; otherwise we fall back to WebM.
const VIDEO_TYPES = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1.4d0028,mp4a.40.2',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];
function pickMime() {
  return VIDEO_TYPES.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
}
// True only when the browser can record H.264 + AAC MP4 (what Instagram
// accepts). A bare "video/mp4" can mean VP9 inside MP4 on some builds.
const canExportMp4 = () => !!window.MediaRecorder && VIDEO_TYPES.slice(0, 4).some((t) => MediaRecorder.isTypeSupported(t));
const canExportVideo = () => !!(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream);

// Renders the picture + effects into an off-screen canvas of the given size
// while the song plays from `start` for `duration` seconds, recording it with
// the song's audio. Real time: a 30 s clip takes 30 s.
//   onCanvas(canvas) – show it as a live preview
//   onProgress(seconds)
// Resolves { blob, type, width, height, seconds } or null if cancelled.
let exportJob = null;

function exportVideo({ width, height, start, duration, onCanvas, onProgress }) {
  return new Promise((resolve, reject) => {
    if (!canExportVideo() || !recDest) { reject(new Error('unsupported')); return; }
    const cnv = document.createElement('canvas');
    cnv.width = width;
    cnv.height = height;
    setRenderTarget(cnv);
    if (onCanvas) onCanvas(cnv);

    const stream = cnv.captureStream(30);
    recDest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    const mimeType = pickMime();
    let rec;
    try {
      rec = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: Math.round(width * height * 30 * 0.13), // ≈8 Mbps at 1080×1920
        audioBitsPerSecond: 192000,
      });
    } catch (err) {
      setRenderTarget(null);
      reject(err);
      return;
    }
    const chunks = [];
    let cancelled = false, timer = 0, began = 0;
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      clearInterval(timer);
      audio.pause();
      stream.getVideoTracks().forEach((t) => t.stop());
      state.recorder = null;
      exportJob = null;
      setRenderTarget(null);
      engine.onRecordChange(false);
      if (cancelled) { resolve(null); return; }
      const type = (rec.mimeType || mimeType || 'video/webm').split(';')[0];
      resolve({ blob: new Blob(chunks, { type }), type, width, height, seconds: Math.max(0, audio.currentTime - began) });
    };
    const finish = () => { if (rec.state !== 'inactive') rec.stop(); };
    exportJob = { cancel() { cancelled = true; finish(); } };

    const go = () => {
      began = audio.currentTime;
      state.recorder = rec;
      engine.onRecordChange(true);
      rec.start(1000);
      play();
      timer = setInterval(() => {
        const t = audio.currentTime - began;
        if (onProgress) onProgress(Math.max(0, t));
        if (t >= duration || audio.ended) finish();
      }, 100);
    };
    if (Math.abs(audio.currentTime - start) > 0.05) {
      audio.addEventListener('seeked', go, { once: true });
      audio.currentTime = start;
    } else go();
  });
}

function stopRecording() {
  if (exportJob) exportJob.cancel();
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

// Resume audio if iOS suspended the context while the app was in the background.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && actx && actx.state !== 'running' && !audio.paused) actx.resume();
});
