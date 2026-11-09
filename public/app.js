// Pulse creator: pick an image + song, tune effects, record or share.
// Rendering and beat sync live in engine.js.
'use strict';

// Picture area = space above the control panel (whole screen when it is hidden).
engine.areaHeight = () => {
  const panel = $('player');
  return panel.hidden || panel.classList.contains('hidden-ui') ? H : panel.getBoundingClientRect().top;
};
engine.onFrame = () => updateTime();
engine.onRecordChange = (on) => {
  $('recordBtn').textContent = on ? '■ Stop' : '● Rec';
  $('recordBtn').classList.toggle('rec', on);
};

const PRESETS = {
  chill: { intensity: 0.3, fx: ['glow', 'rings', 'echo'] },
  club: { intensity: 0.5, fx: ['glow', 'flash', 'rings', 'bars', 'tilt'] },
  hype: { intensity: 0.8, fx: ['glow', 'shake', 'flash', 'rgb', 'sparks', 'strobe', 'echo', 'bounce'] },
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
    state.shareLink = null;
    state.bgBlur = makeBlur(img);
    state.channels = null;
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
  state.audioFile = file;
  state.shareLink = null;
  $('audioName').textContent = file.name;
  prefillDetails(file);
  $('pickAudio').classList.add('done');
  analyzeFile(file);
});

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
  $('setup').hidden = true;
  $('player').hidden = false;
  updateBpm();
  play();
});

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
  $('player').hidden = true;
  $('setup').hidden = false;
});

$('recordBtn').addEventListener('click', () => (state.recorder ? stopRecording() : startRecording()));

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
  if (pendingShare) { pendingShare = false; openShare(); }
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
  if (!details.title || !details.artist) {
    pendingShare = true;
    openDetails('Add the song name and artist before sharing.');
    return;
  }
  openShare();
});

function openShare() {
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
    state.shareLink = link;
    showShareLink(link);
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

function showShareLink(link) {
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
  const res = await fetch('/api/share', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(manifest) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.url) throw userError(out.error || 'Could not create the link.');
  progress('Done', 1);
  return out.url;
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

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

