// PulsePic creator: pick an image + song, tune effects, record or share.
// Rendering and beat sync live in engine.js.
'use strict';

// Picture area = space above the control panel (whole screen when it is hidden).
engine.areaHeight = () => {
  const panel = $('player');
  return panel.hidden || panel.classList.contains('hidden-ui') ? H : panel.getBoundingClientRect().top;
};
engine.onFrame = () => updateTime();
engine.onRecordChange = (on) => { $('recordBtn').classList.toggle('rec', on); };
engine.watermark = true;

const PRESETS = {
  chill: { intensity: 0.3, fx: ['glow', 'rings', 'echo'] },
  club: { intensity: 0.5, fx: ['glow', 'flash', 'rings', 'bars', 'tilt'] },
  hype: { intensity: 0.8, fx: ['glow', 'shake', 'flash', 'rgb', 'sparks', 'strobe', 'echo', 'bounce'] },
};

// ───────────────────────── file pickers ─────────────────────────

$('imageInput').addEventListener('change', (e) => { if (e.target.files[0]) useImageFile(e.target.files[0]); });
$('audioInput').addEventListener('change', (e) => { if (e.target.files[0]) useAudioFile(e.target.files[0]); });

function useImageFile(file) {
  return new Promise((resolve) => {
    if (state.imageURL) URL.revokeObjectURL(state.imageURL);
    state.imageURL = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      state.img = img;
      state.imageFile = file;
      state.shareLink = null;
      state.bgBlur = makeBlur(img);
      state.channels = null;
      $('imageThumb').style.backgroundImage = `url("${state.imageURL}")`;
      $('imageThumb').textContent = '';
      $('imageName').textContent = file.name || 'Picture';
      $('pickImage').classList.add('done');
      updateStart();
      resolve(true);
    };
    img.onerror = () => { toast('Could not open that image'); resolve(false); };
    img.src = state.imageURL;
  });
}

// `restored` = { rawAnalysis } when coming back from sign-in (skips re-analysis
// and keeps the details the user already entered).
function useAudioFile(file, restored) {
  stopEditing();
  if (state.audioURL) URL.revokeObjectURL(state.audioURL);
  state.audioURL = URL.createObjectURL(file);
  audio.src = state.audioURL;
  state.audioFile = file;
  state.shareLink = null;
  $('audioName').textContent = file.name || 'Song';
  $('pickAudio').classList.add('done');
  if (restored && restored.rawAnalysis) {
    analysisToken++;
    state.rawAnalysis = restored.rawAnalysis;
    state.analysis = prepare(restored.rawAnalysis);
    state.analyzing = false;
    setStatus(`${Math.round(restored.rawAnalysis.bpm)} BPM · ${restored.rawAnalysis.beats.length} beats found`);
    updateStart();
    updateBpm();
  } else {
    if (!restored) prefillDetails(file);
    analyzeFile(file);
  }
}

function updateStart() {
  const b = $('startBtn');
  b.disabled = !(state.img && state.audioURL) || state.analyzing;
  b.textContent = state.analyzing ? 'Analyzing song…' : 'Start';
}

function setStatus(msg) { $('status').textContent = msg; }

// ───────────────────────── song analysis ─────────────────────────

let analysisToken = 0;

async function analyzeFile(file) {
  const token = ++analysisToken;
  state.analysis = null;
  state.rawAnalysis = null;
  state.analyzing = true;
  updateStart();
  setStatus('Reading song…');
  try {
    const buf = await file.arrayBuffer();
    if (token !== analysisToken) return;
    setStatus('Decoding…');
    const decoded = await decode(buf);
    if (token !== analysisToken) return;
    const mono = mixdown(decoded);
    setStatus('Finding the beat… 0%');
    const r = await runWorker(mono, decoded.sampleRate, (p) => {
      if (token === analysisToken) setStatus(`Finding the beat… ${Math.round(p * 100)}%`);
    });
    if (token !== analysisToken) return;
    state.analysis = prepare(r);
    state.rawAnalysis = r;
    setStatus(`${Math.round(r.bpm)} BPM · ${r.beats.length} beats found`);
  } catch (err) {
    if (token !== analysisToken) return;
    console.warn('analysis failed', err);
    state.analysis = null;
    setStatus('Could not analyze this song — using live beat detection');
  }
  state.analyzing = false;
  updateStart();
  updateBpm();
}

function updateBpm() {
  $('bpm').textContent = state.analysis ? `${Math.round(state.analysis.bpm)} BPM` : (state.analyzing ? '…' : 'live');
  $('sensLabel').classList.toggle('dim', state.mode === 'beat' && !!state.analysis);
}

// ───────────────────────── controls ─────────────────────────

$('startBtn').addEventListener('click', async () => {
  initAudio();
  await actx.resume();
  enterPlayer();
  updateBpm();
  play();
});

$('playBtn').addEventListener('click', () => { initAudio(); if (audio.paused) play(); else audio.pause(); });
audio.addEventListener('play', () => { $('playBtn').textContent = '❚❚'; $('playBtn').ariaLabel = 'Pause'; });
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

$('intensity').addEventListener('input', (e) => { state.intensity = e.target.value / 100; save(); });
$('sensitivity').addEventListener('input', (e) => { state.sensitivity = e.target.value / 100; save(); });
$('offset').addEventListener('input', (e) => { state.offset = +e.target.value; showOffset(); save(); });
function showOffset() { $('offsetVal').textContent = `${state.offset > 0 ? '+' : ''}${state.offset} ms`; }

document.querySelectorAll('[data-mode]').forEach((b) => {
  b.addEventListener('click', () => { state.mode = b.dataset.mode; syncUI(); save(); });
});

document.querySelectorAll('[data-fx]').forEach((b) => {
  b.addEventListener('click', () => {
    const k = b.dataset.fx;
    state.fx[k] = !state.fx[k];
    syncUI();
    save();
  });
});

document.querySelectorAll('[data-preset]').forEach((b) => {
  b.addEventListener('click', () => {
    const p = PRESETS[b.dataset.preset];
    const round = !!state.fx.round; // shape is a separate choice
    state.fx = Object.fromEntries(p.fx.map((f) => [f, true]));
    state.fx.round = round;
    state.intensity = p.intensity;
    $('intensity').value = Math.round(p.intensity * 100);
    syncUI();
    save();
    toast(`${b.textContent} preset`);
  });
});

function syncUI() {
  document.querySelectorAll('[data-fx]').forEach((b) => b.classList.toggle('on', !!state.fx[b.dataset.fx]));
  document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === state.mode));
  updateBpm();
}

// Fold the effects grid away to give the picture more room.
function setFxOpen(open) {
  $('fxGrid').hidden = !open;
  $('fxToggle').textContent = open ? 'Effects ▾' : 'Effects ▸';
  $('fxToggle').setAttribute('aria-expanded', String(open));
  try { localStorage.setItem('pulse:fxOpen', open ? '1' : '0'); } catch {}
}
$('fxToggle').addEventListener('click', () => setFxOpen($('fxGrid').hidden));
try { setFxOpen(localStorage.getItem('pulse:fxOpen') !== '0'); } catch { setFxOpen(true); }

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
  stopEditing();
  goHome();
});

// Video: a one-time gentle nudge to sign in; exporting works either way.
$('recordBtn').addEventListener('click', () => {
  let nagged = false;
  try { nagged = sessionStorage.getItem('pulse:recNag') === '1'; } catch {}
  if (accountsEnabled() && !account.user && !nagged) { $('recordSheet').hidden = false; return; }
  openExport();
});
$('recordSkip').addEventListener('click', () => {
  try { sessionStorage.setItem('pulse:recNag', '1'); } catch {}
  closeSheets();
  openExport();
});
$('recordSignIn').addEventListener('click', () => { closeSheets(); startSignIn('record'); });

// ───────────────────────── song details ─────────────────────────

const details = { title: '', artist: '', album: '', website: '' };
let detailsTouched = false; // once the user edits, don't overwrite with file tags

function applyDetails() {
  state.credits = { title: details.title, artist: details.artist, album: details.album };
  const summary = [details.title, details.artist].filter(Boolean).join(' — ');
  $('detailsSummary').textContent = summary || 'Optional · shown on the video and share page';
  $('detailsBtnSetup').classList.toggle('done', !!summary);
}

function openDetails(note) {
  for (const k of Object.keys(details)) $('d_' + k).value = details[k];
  $('d_showCredits').checked = state.showCredits;
  $('detailsNote').textContent = note || '';
  $('detailsNote').hidden = !note;
  $('detailsSheet').hidden = false;
  setTimeout(() => $(note ? (!details.title ? 'd_title' : 'd_artist') : 'd_title').focus(), 50);
}
function closeSheets() { document.querySelectorAll('.sheet').forEach((s) => (s.hidden = true)); }

$('detailsForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const web = $('d_website').value.trim();
  const url = normalizeUrl(web);
  if (web && !url) { $('d_website').setCustomValidity('Enter a web address like example.com'); $('d_website').reportValidity(); return; }
  $('d_website').setCustomValidity('');
  details.title = $('d_title').value.trim();
  details.artist = $('d_artist').value.trim();
  details.album = $('d_album').value.trim();
  details.website = url || '';
  state.showCredits = $('d_showCredits').checked;
  detailsTouched = true;
  state.shareLink = null;
  applyDetails();
  save();
  closeSheets();
  if (pendingShare) { pendingShare = false; editing ? openSaveSheet() : openShare(); }
});
$('d_website').addEventListener('input', () => $('d_website').setCustomValidity(''));

function normalizeUrl(v) {
  if (!v) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : 'https://' + v);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) return '';
    return u.href;
  } catch { return ''; }
}

$('detailsBtnSetup').addEventListener('click', () => openDetails());
$('detailsBtn').addEventListener('click', () => openDetails());
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { pendingShare = false; closeSheets(); }));

// Fill in title/artist/album from the song file's tags (MP3 ID3v2), or
// from a "Artist - Title.mp3" file name.
async function prefillDetails(file) {
  if (detailsTouched) return;
  let tags = {};
  try { tags = await readId3(file); } catch {}
  if (!tags.title && !tags.artist) {
    const base = file.name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/_/g, ' ');
    const m = base.split(/\s+[-–—]\s+/);
    if (m.length >= 2) { tags.artist = m[0].trim(); tags.title = m.slice(1).join(' - ').trim(); }
    else tags.title = base.trim();
  }
  details.title = tags.title || '';
  details.artist = tags.artist || '';
  details.album = tags.album || '';
  applyDetails();
}

async function readId3(file) {
  const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
  if (head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return {}; // "ID3"
  const ver = head[3];
  if (ver < 3) return {};
  const size = ((head[6] & 0x7f) << 21) | ((head[7] & 0x7f) << 14) | ((head[8] & 0x7f) << 7) | (head[9] & 0x7f);
  const buf = new Uint8Array(await file.slice(10, 10 + Math.min(size, 512 * 1024)).arrayBuffer());
  const out = {};
  const want = { TIT2: 'title', TPE1: 'artist', TALB: 'album' };
  let i = 0;
  while (i + 10 <= buf.length) {
    const id = String.fromCharCode(buf[i], buf[i + 1], buf[i + 2], buf[i + 3]);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const len = ver === 4
      ? ((buf[i + 4] & 0x7f) << 21) | ((buf[i + 5] & 0x7f) << 14) | ((buf[i + 6] & 0x7f) << 7) | (buf[i + 7] & 0x7f)
      : (buf[i + 4] << 24) | (buf[i + 5] << 16) | (buf[i + 6] << 8) | buf[i + 7];
    const body = buf.subarray(i + 10, i + 10 + len);
    if (want[id] && body.length > 1) out[want[id]] = decodeId3Text(body);
    i += 10 + len;
  }
  return out;
}

function decodeId3Text(b) {
  const enc = b[0];
  const data = b.subarray(1);
  const label = enc === 0 ? 'latin1' : enc === 1 ? 'utf-16' : enc === 2 ? 'utf-16be' : 'utf-8';
  return new TextDecoder(label).decode(data).replace(/\u0000.*$/s, '').replace(/^﻿/, '').trim();
}

// ───────────────────────── sharing ─────────────────────────

let pendingShare = false;
let shareBusy = false;

$('shareBtn').addEventListener('click', () => {
  if (editing && details.title && details.artist) { openSaveSheet(); return; }
  if (!details.title || !details.artist) {
    pendingShare = true;
    openDetails('Add the song name and artist before sharing.');
    return;
  }
  openShare();
});

function openShare() {
  updateShareAccountUI();
  $('shareTitle').textContent = details.title;
  $('shareSub').textContent = [details.artist, details.album].filter(Boolean).join(' · ');
  $('shareError').hidden = true;
  $('shareProgress').hidden = true;
  if (state.shareLink) showShareLink(state.shareLink);
  else { $('shareForm').hidden = false; $('shareDone').hidden = true; }
  $('shareSheet').hidden = false;
}

$('shareForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (shareBusy) return;
  if (!$('s_rights').checked) { $('s_rights').reportValidity(); return; }
  shareBusy = true;
  $('shareCreate').disabled = true;
  $('shareError').hidden = true;
  try {
    const link = await createShare((label, p) => {
      $('shareProgress').hidden = false;
      $('shareProgressLabel').textContent = label;
      $('shareProgressBar').style.width = `${Math.round(p * 100)}%`;
    });
    state.shareLink = link.url;
    state.shareId = link.id;
    state.shareExpires = link.expiresAt;
    showShareLink(link.url);
  } catch (err) {
    console.warn('share failed', err);
    $('shareError').textContent = err.userMessage || 'Upload failed. Check your connection and try again.';
    $('shareError').hidden = false;
  } finally {
    shareBusy = false;
    $('shareCreate').disabled = false;
    $('shareProgress').hidden = true;
  }
});

// Signed out (and accounts available): offer sign-in so the link is kept;
// otherwise it's a 30-day guest link.
function updateShareAccountUI() {
  const guest = !account.user;
  const canSignIn = accountsEnabled() && guest;
  // Signed in and this device no longer holds the claim → it was claimed.
  if (!guest && state.shareExpires && !guestLinks().some((c) => c.id === state.shareId)) state.shareExpires = null;
  $('shareAccount').hidden = !canSignIn;
  $('shareOwnerNote').hidden = guest;
  $('shareGuestNote').hidden = !guest || canSignIn;
  $('shareCreate').textContent = guest ? 'Create 30-day link' : 'Create link';
  const exp = state.shareExpires ? new Date(state.shareExpires) : null;
  $('shareExpiry').textContent = exp
    ? `This guest link stops working on ${exp.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}.`
    : 'Saved to your account. This link won’t expire.';
  $('shareKeep').hidden = !(exp && canSignIn);
}

$('shareSignIn').addEventListener('click', () => startSignIn('share'));
$('shareKeep').addEventListener('click', () => startSignIn('share'));

function showShareLink(link) {
  updateShareAccountUI();
  $('shareForm').hidden = true;
  $('shareDone').hidden = false;
  $('shareLink').value = link;
  $('shareOpen').href = link;
}

$('shareCopy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('shareLink').value); toast('Link copied'); }
  catch { $('shareLink').select(); document.execCommand('copy'); toast('Link copied'); }
});
$('shareNative').addEventListener('click', async () => {
  const url = $('shareLink').value;
  if (navigator.share) {
    try { await navigator.share({ title: `${details.title} — ${details.artist}`, url }); } catch {}
  } else {
    $('shareCopy').click();
  }
});

const userError = (msg) => Object.assign(new Error(msg), { userMessage: msg });
const MB = 1024 * 1024;

async function createShare(progress) {
  if (!state.img || !state.audioFile) throw userError('Pick an image and a song first.');
  if (state.analyzing) throw userError('Still analyzing the song — try again in a moment.');
  const cfg = await fetch('/api/config').then((r) => r.json()).catch(() => ({}));
  if (cfg.storage !== 'blob' && cfg.storage !== 'local') throw userError('Sharing is not set up on this server yet.');

  // Studio files (WAV/AIFF/FLAC) and anything over the limit are converted
  // to MP3 on the phone first, so uploads are small and share pages load fast.
  let song = { blob: state.audioFile, name: safeName(state.audioFile.name, 'song.mp3'), delay: 0 };
  song.type = state.audioFile.type || guessAudioType(song.name);
  if (needsCompression(state.audioFile)) {
    progress('Compressing song…', 0.02);
    song = await compressSong(state.audioFile, (p) => progress(`Compressing song… ${Math.round(p * 100)}%`, 0.02 + p * 0.33));
  }
  if (song.blob.size > MAX_SONG) throw userError('That song is too long to share (over 40 MB even after compressing).');

  progress('Preparing cover…', 0.35);
  const cover = await coverJpeg(state.img);
  const img = await uploadFile(cfg, 'img', cover.blob, 'cover.jpg', 'image/jpeg', (p) => progress('Uploading cover…', 0.35 + p * 0.05));
  const up = await uploadFile(cfg, 'audio', song.blob, song.name, song.type, (p) => progress(`Uploading song… ${Math.round(p * 100)}%`, 0.4 + p * 0.55));

  progress('Creating link…', 0.97);
  const r = state.rawAnalysis;
  const manifest = {
    v: 1,
    title: details.title, artist: details.artist, album: details.album, website: details.website,
    image: { url: img.url, width: cover.width, height: cover.height },
    audio: { url: up.url, type: song.type, duration: isFinite(audio.duration) ? audio.duration : null, delay: song.delay },
    settings: { fx: state.fx, intensity: state.intensity, sensitivity: state.sensitivity, mode: state.mode },
    analysis: r ? {
      bpm: r.bpm,
      beats: r.beats.map((t, i) => [+t.toFixed(3), +r.beatStrength[i].toFixed(2), (i - r.downPhase) % 4 === 0 ? 1 : 0]),
      kicks: r.kicks.map(([t, z]) => [+t.toFixed(3), +z.toFixed(2)]),
      hits: r.hits.map(([t, z]) => [+t.toFixed(3), +z.toFixed(2)]),
    } : null,
  };
  const res = await authFetch('/api/share', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(manifest) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.url) throw userError(out.error || 'Could not create the link.');
  if (out.claimToken) rememberGuestLink({ id: out.id, token: out.claimToken, expiresAt: out.expiresAt, title: details.title });
  progress('Done', 1);
  return out;
}

async function uploadFile(cfg, kind, blob, name, type, onProgress) {
  const pathname = `media/${kind}/${name}`;
  if (cfg.storage === 'local') {
    const res = await fetch(`/api/dev-upload?pathname=${encodeURIComponent(pathname)}`, { method: 'PUT', headers: { 'content-type': type }, body: blob });
    if (!res.ok) throw userError('Upload failed.');
    onProgress(1);
    return res.json();
  }
  const { uploadPresigned } = await import('/vendor/blob-client.js');
  try {
    return await uploadPresigned(pathname, blob, {
      access: 'public',
      handleUploadUrl: '/api/upload',
      contentType: type,
      onUploadProgress: (e) => onProgress(e.percentage / 100),
    });
  } catch (err) {
    throw userError(/size|large/i.test(err.message) ? 'That file is too large to share.' : 'Upload failed. Check your connection and try again.');
  }
}

// Re-encode the picture as a JPEG (max 1600 px) so the share page loads fast.
function coverJpeg(img) {
  const s = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.width * s));
  c.height = Math.max(1, Math.round(img.height * s));
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve({ blob: b, width: c.width, height: c.height }) : reject(new Error('encode failed'))), 'image/jpeg', 0.88));
}

function safeName(name, fallback) {
  const ext = (name.match(/\.([a-z0-9]{2,5})$/i) || [, ''])[1].toLowerCase();
  const base = name.replace(/\.[^.]+$/, '').normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/^[-.]+|-+$/g, '').slice(0, 60).toLowerCase();
  return base && ext ? `${base}.${ext}` : fallback;
}

// ───────────────────────── song compression ─────────────────────────

const MAX_SONG = 40 * MB;
const MAX_MINUTES = 15;
// MP3 encoders add ~1105 samples of lead-in silence (LAME encoder delay +
// decoder delay) that browsers don't strip without a LAME tag. The share page
// shifts the beat map by this much so effects stay on the beat.
const MP3_DELAY_SAMPLES = 1105;

function needsCompression(file) {
  return /^audio\/(x-|vnd\.)?(wav|wave|aiff|flac)$/i.test(file.type)
    || /\.(wav|wave|aif|aiff|aifc|flac)$/i.test(file.name)
    || file.size > MAX_SONG;
}

let compressed = null; // { file, result } so a retry doesn't re-encode

async function compressSong(file, onProgress) {
  if (compressed && compressed.file === file) return compressed.result;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const sampleRate = 44100;
  const buf = await new Promise((resolve, reject) => {
    file.arrayBuffer().then((ab) => {
      const p = new OAC(2, 1, sampleRate).decodeAudioData(ab, resolve, reject);
      if (p && p.then) p.then(resolve, reject);
    }, reject);
  }).catch(() => { throw userError('Could not read this song file to compress it. Try an MP3.'); });
  if (buf.duration > MAX_MINUTES * 60) throw userError(`Songs longer than ${MAX_MINUTES} minutes can't be shared yet.`);

  const stereo = buf.numberOfChannels >= 2;
  const channels = [buf.getChannelData(0).slice()];
  if (stereo) channels.push(buf.getChannelData(1).slice());
  const blob = await new Promise((resolve, reject) => {
    const w = new Worker('/encode-worker.js');
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') onProgress(m.p);
      else if (m.type === 'done') { w.terminate(); resolve(m.blob); }
      else { w.terminate(); reject(userError('Compressing the song failed. Try an MP3 instead.')); }
    };
    w.onerror = () => { w.terminate(); reject(userError('Compressing the song failed. Try an MP3 instead.')); };
    w.postMessage({ channels, sampleRate, bitrate: stereo ? 192 : 128 }, channels.map((c) => c.buffer));
  });
  onProgress(1);
  const base = safeName(file.name, 'song.wav').replace(/\.[^.]+$/, '');
  const result = { blob, name: `${base}.mp3`, type: 'audio/mpeg', delay: MP3_DELAY_SAMPLES / sampleRate };
  compressed = { file, result };
  return result;
}

function guessAudioType(name) {
  const ext = name.split('.').pop();
  return { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', webm: 'audio/webm' }[ext] || 'audio/mpeg';
}

function save() {
  try {
    localStorage.setItem('pulse:settings', JSON.stringify({
      fx: state.fx, intensity: state.intensity, sensitivity: state.sensitivity, offset: state.offset, mode: state.mode,
      showCredits: state.showCredits,
    }));
  } catch {}
}
(function load() {
  try {
    const s = JSON.parse(localStorage.getItem('pulse:settings'));
    if (s) {
      if (s.fx) state.fx = s.fx;
      state.intensity = s.intensity ?? state.intensity;
      state.sensitivity = s.sensitivity ?? state.sensitivity;
      state.offset = s.offset ?? 0;
      if (['beat', 'kick', 'hits'].includes(s.mode)) state.mode = s.mode;
      if (typeof s.showCredits === 'boolean') state.showCredits = s.showCredits;
    }
  } catch {}
  $('intensity').value = Math.round(state.intensity * 100);
  $('sensitivity').value = Math.round(state.sensitivity * 100);
  $('offset').value = state.offset;
  showOffset();
  syncUI();
  applyDetails();
})();

// ───────────────────────── editing a saved song ─────────────────────────
// Opens one of the user's links in the player with its picture, song,
// details and effects. Save updates the same link in place (the song and
// its beat map stay; the picture can be swapped).

let editing = null; // { id, url, imageChanged }
const viaProxy = (u) => (u.startsWith('/') ? u : `/api/media?u=${encodeURIComponent(u)}`);

async function startEdit(id) {
  toast('Opening your song…');
  try {
    const res = await authFetch(`/api/share?id=${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`load ${res.status}`);
    const m = await res.json();
    const pic = await fetch(viaProxy(m.image.url));
    if (!pic.ok) throw new Error('picture');
    const blob = await pic.blob();
    if (state.recorder) stopRecording();
    audio.pause();
    await useImageFile(new File([blob], 'cover.jpg', { type: blob.type || 'image/jpeg' }));

    // The song streams from storage through our own origin, so Web Audio
    // effects and recording keep working.
    analysisToken++;
    if (state.audioURL && state.audioURL.startsWith('blob:')) URL.revokeObjectURL(state.audioURL);
    state.audioURL = viaProxy(m.audio.url);
    audio.src = state.audioURL;
    state.audioFile = null;
    state.rawAnalysis = null;
    state.analyzing = false;
    state.audioDelay = m.audio.delay || 0;
    const a = m.analysis;
    state.analysis = a ? {
      bpm: a.bpm,
      beats: a.beats.map(([t, s2, d]) => ({ t, s: s2, down: !!d })),
      kicks: a.kicks.map(([t, z]) => ({ t, z })),
      hits: a.hits.map(([t, z]) => ({ t, z })),
    } : null;

    Object.assign(details, { title: m.title, artist: m.artist, album: m.album || '', website: m.website || '' });
    detailsTouched = true;
    applyDetails();
    const st = m.settings || {};
    state.fx = { ...(st.fx || {}) };
    if (typeof st.intensity === 'number') state.intensity = st.intensity;
    if (typeof st.sensitivity === 'number') state.sensitivity = st.sensitivity;
    if (st.mode) state.mode = st.mode;
    $('intensity').value = Math.round(state.intensity * 100);
    $('sensitivity').value = Math.round(state.sensitivity * 100);
    syncUI();

    editing = { id: m.id, url: `${location.origin}/s/${m.id}`, imageChanged: false };
    state.shareLink = null;
    $('shareBtn').textContent = 'Save';
    enterPlayer();
    updateBpm();
    setStatus(a ? `${Math.round(a.bpm)} BPM` : '');
    toast(`Editing “${m.title}”. Tap Save when you’re done.`);
  } catch (err) {
    console.warn('edit load failed', err);
    toast('Could not open that song for editing');
  }
}

function stopEditing() {
  if (!editing) return;
  editing = null;
  state.audioDelay = 0;
  $('shareBtn').textContent = 'Share';
}

function openSaveSheet() {
  $('saveTitle').textContent = details.title;
  $('saveSub').textContent = [details.artist, details.album].filter(Boolean).join(' · ');
  $('saveError').hidden = true;
  $('saveProgress').hidden = true;
  $('saveForm').hidden = false;
  $('saveDone').hidden = true;
  $('savePicNote').textContent = editing.imageChanged ? 'New picture will be uploaded.' : '';
  $('saveSheet').hidden = false;
}

$('changePicBtn').addEventListener('click', () => $('changePicInput').click());
$('changePicInput').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f || !editing) return;
  if (await useImageFile(f)) {
    editing.imageChanged = true;
    $('savePicNote').textContent = 'New picture will be uploaded.';
  }
  e.target.value = '';
});

$('saveForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!editing || shareBusy) return;
  shareBusy = true;
  $('saveBtn').disabled = true;
  $('saveError').hidden = true;
  try {
    let image;
    if (editing.imageChanged) {
      $('saveProgress').hidden = false;
      const cfg = await fetch('/api/config').then((r) => r.json());
      const cover = await coverJpeg(state.img);
      const up = await uploadFile(cfg, 'img', cover.blob, 'cover.jpg', 'image/jpeg', (p) => {
        $('saveProgressBar').style.width = `${Math.round(p * 100)}%`;
      });
      image = { url: up.url, width: cover.width, height: cover.height };
    }
    const res = await authFetch(`/api/share?id=${encodeURIComponent(editing.id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: details.title, artist: details.artist, album: details.album, website: details.website,
        settings: { fx: state.fx, intensity: state.intensity, sensitivity: state.sensitivity, mode: state.mode },
        image,
      }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw userError(out.error || 'Could not save your changes.');
    editing.imageChanged = false;
    $('saveForm').hidden = true;
    $('saveDone').hidden = false;
    $('saveLink').value = out.url;
    $('saveOpen').href = out.url;
  } catch (err) {
    console.warn('save failed', err);
    $('saveError').textContent = err.userMessage || 'Could not save. Check your connection and try again.';
    $('saveError').hidden = false;
  } finally {
    shareBusy = false;
    $('saveBtn').disabled = false;
    $('saveProgress').hidden = true;
  }
});

$('saveCopy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('saveLink').value); toast('Link copied'); } catch { toast($('saveLink').value); }
});

// ───────────────────────── export video ─────────────────────────
// 1080p MP4 for Instagram Stories/Reels (9:16), square or 4:5 feed posts, or
// TikTok. Records from wherever the song is now, for the chosen length.

const FORMATS = {
  story: { w: 1080, h: 1920, name: 'story' },
  square: { w: 1080, h: 1080, name: 'square' },
  portrait: { w: 1080, h: 1350, name: 'feed' },
};
let exportFmt = 'story', exportLen = 30, exportResult = null;

function exportRange() {
  const dur = isFinite(audio.duration) ? audio.duration : 0;
  let start = audio.currentTime || 0;
  if (!dur || start >= dur - 1) start = 0;
  const left = Math.max(0, dur - start);
  return { start, len: exportLen === 'full' ? left : Math.min(exportLen, left) };
}

function showExportStep(step) {
  for (const id of ['exportSetup', 'exportRun', 'exportDone']) $(id).hidden = id !== step;
}

function updateExportSetup() {
  document.querySelectorAll('[data-fmt]').forEach((b) => b.classList.toggle('on', b.dataset.fmt === exportFmt));
  document.querySelectorAll('[data-len]').forEach((b) => b.classList.toggle('on', String(exportLen) === b.dataset.len));
  const { start, len } = exportRange();
  $('exportRange').textContent = len
    ? `Starts at ${fmt(start)} and runs ${Math.round(len)} s. To start somewhere else, close this and drag the song slider first.`
    : 'The song hasn’t loaded yet. Try again in a moment.';
  $('exportStart').disabled = !len;
  $('exportFormatNote').hidden = canExportMp4();
}

function openExport() {
  if (!canExportVideo()) { toast('This browser can’t export video. Try Safari on iPhone or Chrome on Android.'); return; }
  initAudio();
  audio.pause();
  $('exWatermark').checked = engine.watermark;
  showExportStep('exportSetup');
  updateExportSetup();
  $('exportSheet').hidden = false;
}

document.querySelectorAll('[data-fmt]').forEach((b) => b.addEventListener('click', () => { exportFmt = b.dataset.fmt; updateExportSetup(); }));
document.querySelectorAll('[data-len]').forEach((b) => b.addEventListener('click', () => {
  exportLen = b.dataset.len === 'full' ? 'full' : +b.dataset.len;
  updateExportSetup();
}));
$('exWatermark').addEventListener('change', (e) => { engine.watermark = e.target.checked; });

$('exportStart').addEventListener('click', async () => {
  const f = FORMATS[exportFmt];
  const { start, len } = exportRange();
  if (!len) return;
  showExportStep('exportRun');
  $('exportBar').style.width = '0%';
  $('exportRunNote').textContent = 'Keep PulsePic open until it finishes.';
  const onCanvas = (c) => $('exportPreview').replaceChildren(c);
  let result;
  try {
    // Fast path: render + hardware-encode without playing (needs the beat map).
    $('exportLabel').textContent = 'Preparing…';
    let slowDevice = false;
    try { slowDevice = localStorage.getItem('pulse:fastExport') === 'slow'; } catch {}
    const mb = state.analysis && !slowDevice ? await fastExportSupport(f.w, f.h) : null;
    if (mb) {
      const t0 = performance.now();
      try {
        result = await exportVideoFast(mb, {
          width: f.w, height: f.h, start, duration: len, onCanvas,
          onProgress: (p) => {
            $('exportBar').style.width = `${Math.round(p * 100)}%`;
            $('exportLabel').textContent = `Making your video… ${Math.round(p * 100)}%`;
          },
        });
        if (result) console.info(`fast export: ${len.toFixed(1)} s video in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
      } catch (err) {
        console.warn('fast export failed, recording in real time instead', err);
        if (err && err.tooSlow) { try { localStorage.setItem('pulse:fastExport', 'slow'); } catch {} }
        result = undefined;
      }
    }
    // Fallback: play the clip and record it in real time.
    if (result === undefined) {
      $('exportRunNote').textContent = 'Records in real time. Keep PulsePic open until it finishes.';
      $('exportLabel').textContent = `Recording 0:00 / ${fmt(len)}`;
      result = await exportVideo({
        width: f.w, height: f.h, start, duration: len, onCanvas,
        onProgress: (t) => {
          $('exportBar').style.width = `${Math.min(100, (t / len) * 100)}%`;
          $('exportLabel').textContent = `Recording ${fmt(Math.min(t, len))} / ${fmt(len)}`;
        },
      });
    }
  } catch (err) {
    console.warn('export failed', err);
    toast('Could not make the video on this browser');
    showExportStep('exportSetup');
    return;
  } finally {
    $('exportPreview').replaceChildren();
  }
  if (!result) { showExportStep('exportSetup'); updateExportSetup(); return; }
  showExportDone(result, f);
});

$('exportCancel').addEventListener('click', () => stopRecording());
// Closing the sheet while recording cancels it.
$('exportSheet').querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => stopRecording()));

function exportFileName(f, type) {
  const base = [details.artist, details.title].filter(Boolean).join(' - ') || 'pulsepic';
  const slug = base.normalize('NFKD').replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'pulsepic';
  return `${slug}-${f.name}.${type.includes('mp4') ? 'mp4' : 'webm'}`;
}

function showExportDone(r, f) {
  if (exportResult) URL.revokeObjectURL(exportResult.url);
  const file = new File([r.blob], exportFileName(f, r.type), { type: r.type });
  exportResult = { file, url: URL.createObjectURL(r.blob) };
  $('exportVideo').src = exportResult.url;
  $('exportDownload').href = exportResult.url;
  $('exportDownload').download = file.name;
  const mb = (r.blob.size / 1048576).toFixed(1);
  $('exportInfo').textContent = `${r.type.includes('mp4') ? 'MP4' : 'WebM'} · ${r.width}×${r.height} · ${Math.round(r.seconds)} s · ${mb} MB`;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  $('exportTip').textContent = ios
    ? 'Tap Share / Save → Instagram to post it, or Save Video to keep it in Photos.'
    : 'Tap Share / Save → Instagram to post it, or Download to keep it on your phone.';
  $('exportShare').hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
  $('exportCodecNote').hidden = r.fast || canExportMp4();
  showExportStep('exportDone');
}

// Must run straight from the tap (share sheets need a fresh user gesture).
$('exportShare').addEventListener('click', async () => {
  if (!exportResult) return;
  try {
    await navigator.share({ files: [exportResult.file], title: details.title || 'PulsePic' });
  } catch (err) {
    if (err.name !== 'AbortError') $('exportDownload').click();
  }
});
$('exportAgain').addEventListener('click', () => { showExportStep('exportSetup'); updateExportSetup(); });

// ───────────────────────── home page ↔ player ─────────────────────────

function enterPlayer() {
  document.body.classList.remove('home');
  $('player').hidden = false;
  window.scrollTo(0, 0);
  resize();
}

function goHome() {
  $('player').hidden = true;
  document.body.classList.add('home');
  requestAnimationFrame(() => $('setup').scrollIntoView({ block: 'start' }));
}

// ───────────────────────── accounts ─────────────────────────

// What to keep if the user leaves for Google/Apple sign-in.
makeDraft = (pending) => (state.imageFile && state.audioFile ? {
  pending,
  image: state.imageFile,
  audio: state.audioFile,
  details: { ...details },
  showCredits: state.showCredits,
  rawAnalysis: state.rawAnalysis,
  shareLink: state.shareLink ? { url: state.shareLink, id: state.shareId, expiresAt: state.shareExpires } : null,
} : null);

account.onChange((user, prev) => {
  if (user && !prev) clearDraft(); // signed in without leaving the page
  if (!$('shareSheet').hidden) updateShareAccountUI();
});
account.claimListeners.push((claimed) => {
  if (state.shareId && claimed.includes(state.shareId)) {
    state.shareExpires = null;
    if (!$('shareSheet').hidden) updateShareAccountUI();
  }
});

// Back from sign-in: put the picture, song and details back and carry on.
async function restoreDraft() {
  const d = await loadDraft();
  if (!d) return;
  await clearDraft();
  if (!d.pending || Date.now() - d.at > 30 * 60 * 1000 || !d.image || !d.audio) return;
  await useImageFile(d.image);
  useAudioFile(d.audio, { rawAnalysis: d.rawAnalysis });
  Object.assign(details, d.details || {});
  detailsTouched = true;
  if (typeof d.showCredits === 'boolean') state.showCredits = d.showCredits;
  applyDetails();
  if (d.shareLink) { state.shareLink = d.shareLink.url; state.shareId = d.shareLink.id; state.shareExpires = d.shareLink.expiresAt; }
  enterPlayer();
  updateBpm();
  if (d.pending === 'share') openShare();
  else if (account.user) toast('Signed in. Tap Rec to record.');
}

initAccount().then(restoreDraft);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

