// Fast video export: renders every frame off-screen as fast as the device can
// (no playback), encodes with the hardware H.264 encoder via WebCodecs, encodes
// the song clip to AAC, and muxes an MP4 (Mediabunny). A 30 s clip usually
// takes a fraction of 30 s. Falls back to real-time recording (exportVideo in
// engine.js) when the browser can't do this.
'use strict';

const FAST_FPS = 30;
const CHECK_FRAMES = 45;
const AAC_PRIMING = 1024;
let fastLib = null;            // Mediabunny exports, once loaded
let decodedSong = null;        // { key, buffer } so repeat exports skip decoding

// Mediabunny if this browser can encode H.264 at this size and AAC (natively
// or via the WASM AAC encoder add-on), else null.
async function fastExportSupport(width, height) {
  if (!('VideoEncoder' in window) || !('VideoFrame' in window) || !window.OfflineAudioContext) return null;
  try {
    const mb = fastLib || (fastLib = await import('/vendor/media-export.js'));
    const bitrate = videoBitrate(width, height);
    if (!(await mb.canEncodeVideo('avc', { width, height, bitrate }))) return null;
    const audioOpts = { numberOfChannels: 2, sampleRate: 48000, bitrate: 192000 };
    if (!(await mb.canEncodeAudio('aac', audioOpts))) {
      const { registerAacEncoder } = await import('/vendor/aac-encoder.js');
      registerAacEncoder();
      if (!(await mb.canEncodeAudio('aac', audioOpts))) return null;
    }
    return mb;
  } catch (err) {
    console.warn('fast export unavailable', err);
    return null;
  }
}

const videoBitrate = (w, h) => Math.round(w * h * 30 * 0.13); // ≈8 Mbps at 1080×1920

// The whole song as an AudioBuffer at 48 kHz (decoded once per song).
async function decodeSong() {
  const key = state.audioFile || state.audioURL;
  if (decodedSong && decodedSong.key === key) return decodedSong.buffer;
  const bytes = state.audioFile
    ? await state.audioFile.arrayBuffer()
    : await fetch(state.audioURL).then((r) => { if (!r.ok) throw new Error('song download failed'); return r.arrayBuffer(); });
  const ctxA = new OfflineAudioContext(2, 1, 48000);
  const buffer = await new Promise((resolve, reject) => {
    const p = ctxA.decodeAudioData(bytes, resolve, reject);
    if (p && p.then) p.then(resolve, reject);
  });
  decodedSong = { key, buffer };
  return buffer;
}

// ── Spectrum like the live AnalyserNode (fftSize 2048, Blackman window,
//    smoothing 0, −100…−30 dB → 0…255), so Bars and the bass "breathing"
//    look the same as on screen.
const AN_N = 2048;
const anWin = new Float32Array(AN_N);
for (let i = 0; i < AN_N; i++) {
  const a = (2 * Math.PI * i) / (AN_N - 1);
  anWin[i] = 0.42 - 0.5 * Math.cos(a) + 0.08 * Math.cos(2 * a);
}
const anRev = new Uint32Array(AN_N);
for (let i = 0, bits = Math.log2(AN_N); i < AN_N; i++) {
  let r = 0;
  for (let j = 0, x = i; j < bits; j++, x >>= 1) r = (r << 1) | (x & 1);
  anRev[i] = r;
}
const anCos = new Float32Array(AN_N / 2), anSin = new Float32Array(AN_N / 2);
for (let i = 0; i < AN_N / 2; i++) { anCos[i] = Math.cos((2 * Math.PI * i) / AN_N); anSin[i] = Math.sin((2 * Math.PI * i) / AN_N); }
const anRe = new Float32Array(AN_N), anIm = new Float32Array(AN_N), anBytes = new Uint8Array(AN_N / 2);

function spectrumBytes(mono, endIndex) {
  for (let i = 0; i < AN_N; i++) {
    const j = endIndex - AN_N + i;
    anRe[i] = (j >= 0 && j < mono.length ? mono[j] : 0) * anWin[i];
    anIm[i] = 0;
  }
  for (let i = 0; i < AN_N; i++) {
    const j = anRev[i];
    if (j > i) { let t = anRe[i]; anRe[i] = anRe[j]; anRe[j] = t; t = anIm[i]; anIm[i] = anIm[j]; anIm[j] = t; }
  }
  for (let size = 2; size <= AN_N; size <<= 1) {
    const half = size >> 1, step = AN_N / size;
    for (let i = 0; i < AN_N; i += size) {
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const a = i + j, b = a + half;
        const tr = anRe[b] * anCos[k] + anIm[b] * anSin[k];
        const ti = anIm[b] * anCos[k] - anRe[b] * anSin[k];
        anRe[b] = anRe[a] - tr; anIm[b] = anIm[a] - ti;
        anRe[a] += tr; anIm[a] += ti;
      }
    }
  }
  for (let k = 0; k < AN_N / 2; k++) {
    const mag = Math.sqrt(anRe[k] * anRe[k] + anIm[k] * anIm[k]) / AN_N;
    const db = 20 * Math.log10(mag + 1e-12);
    anBytes[k] = Math.max(0, Math.min(255, Math.floor((255 / 70) * (db + 100))));
  }
  return anBytes;
}

// Resolves { blob, type, width, height, seconds, fast: true } or null if cancelled.
// Throws if anything fails (the caller then falls back to real-time recording).
async function exportVideoFast(mb, { width, height, start, duration, onCanvas, onProgress }) {
  const song = await decodeSong();
  const sr = song.sampleRate;
  // Shared/edited songs are MP3s with a short encoder lead-in; beat times are
  // in the original song's time, so the audio is read that much later.
  // AAC encoders put 1024 samples of priming in front of the audio, and the
  // MP4 has no edit list to hide it, so players start 21 ms late. Starting the
  // input 1024 samples later cancels that out (measured: 0 ms offset).
  const from = Math.max(0, Math.round((start + (state.audioDelay || 0)) * sr) + AAC_PRIMING);
  const len = Math.max(1, Math.min(Math.round(duration * sr), song.length - from));
  const chans = Math.min(2, song.numberOfChannels);
  const clip = new AudioBuffer({ length: len, numberOfChannels: chans, sampleRate: sr });
  const mono = new Float32Array(len + AN_N);
  for (let c = 0; c < chans; c++) {
    const src = song.getChannelData(c);
    const part = src.subarray(from, from + len);
    clip.copyToChannel(part, c);
    // mono with AN_N samples of look-back for the analyser window
    for (let i = 0; i < len + AN_N; i++) {
      const j = from - AN_N + i;
      if (j >= 0 && j < src.length) mono[i] += src[j] / chans;
    }
  }
  const seconds = len / sr;
  const total = Math.max(1, Math.round(seconds * FAST_FPS));

  const cnv = document.createElement('canvas');
  cnv.width = width;
  cnv.height = height;
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() });
  const video = new mb.CanvasSource(cnv, { codec: 'avc', bitrate: videoBitrate(width, height), keyFrameInterval: 2 });
  const audioSrc = new mb.AudioBufferSource({ codec: 'aac', bitrate: 192000 });
  output.addVideoTrack(video, { frameRate: FAST_FPS });
  output.addAudioTrack(audioSrc);

  let cancelled = false;
  exportJob = { cancel() { cancelled = true; } };
  audio.pause();
  offline = true;
  setRenderTarget(cnv);
  if (onCanvas) onCanvas(cnv);
  engine.onRecordChange(true);
  // Start the effects from rest, like pressing play at `start`.
  state.pulse = 0; state.level = 0; flash = 0; strobe = 0; bars.fill(0);
  lastEvents = null; lastHeard = -1;

  try {
    await output.start();
    await audioSrc.add(clip);
    audioSrc.close();
    const binHz = sr / AN_N;
    const dt = 1 / FAST_FPS;
    const began = performance.now();
    let shown = began;
    for (let i = 0; i < total; i++) {
      if (cancelled) break;
      const t = start + i * dt;
      const now = i * 1000 * dt;
      if (state.analysis) dispatch(t, now);
      levelsFrom(spectrumBytes(mono, AN_N + Math.round(i * dt * sr)), binHz);
      decay(dt);
      draw(now, dt);
      await video.add(i * dt, dt);
      // Without a hardware encoder this can be slower than just recording in
      // real time; after ~1.5 s of video, bail out to real-time if so.
      if (i === CHECK_FRAMES && total > CHECK_FRAMES * 3 && !window.__pulseSkipSpeedCheck) {
        const projected = ((performance.now() - began) / (i + 1)) * total / 1000;
        if (projected > seconds * 0.95) {
          const e = new Error(`fast export too slow (${projected.toFixed(1)} s for ${seconds.toFixed(1)} s)`);
          e.tooSlow = true;
          throw e;
        }
      }
      if (performance.now() - shown > 100) {
        shown = performance.now();
        if (onProgress) onProgress(i / total);
        await new Promise((r) => setTimeout(r, 0)); // let the preview & progress paint
      }
    }
    if (cancelled) { await output.cancel(); return null; }
    video.close();
    await output.finalize();
    if (onProgress) onProgress(1);
    return { blob: new Blob([output.target.buffer], { type: 'video/mp4' }), type: 'video/mp4', width, height, seconds, fast: true };
  } catch (err) {
    try { await output.cancel(); } catch {}
    throw err;
  } finally {
    exportJob = null;
    offline = false;
    setRenderTarget(null);
    engine.onRecordChange(false);
  }
}
