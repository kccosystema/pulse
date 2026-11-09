// Beat analysis, run once per song in a Web Worker so the UI stays smooth.
//
//   1. Short-time FFT → ~40 log-spaced frequency bands (roughly mel-like).
//   2. Spectral flux (how much each band got louder since the last frame) →
//      an "onset strength" curve for the whole mix and one for the bass only.
//   3. Tempo: autocorrelation of the onset curve, weighted toward ~120 BPM.
//   4. Beats: dynamic-programming beat tracker (Ellis 2007, the same idea as
//      librosa.beat.beat_track) that picks a steady grid of beats which lands
//      on strong onsets but is allowed to drift slightly with the music.
//   5. Downbeats (first beat of each bar): the phase of 4 whose beats carry
//      the most bass energy.
//   6. Individual kick drum hits and all hits, peak-picked from the curves,
//      each with a z-score so the app can filter by sensitivity live.
'use strict';

if (typeof self !== 'undefined' && typeof module === 'undefined') {
  self.onmessage = (e) => {
    const { samples, sampleRate } = e.data;
    try {
      const result = analyze(samples, sampleRate, (p) => self.postMessage({ type: 'progress', p }));
      self.postMessage({ type: 'done', result });
    } catch (err) {
      self.postMessage({ type: 'error', message: String((err && err.message) || err) });
    }
  };
}

function analyze(x, sr, progress = () => {}) {
  const N = sr >= 32000 ? 2048 : 1024; // ~46 ms window
  const H = N / 4;                     // ~11.6 ms hop
  const fps = sr / H;
  const nFrames = Math.floor((x.length - N) / H) + 1;
  if (!(nFrames > fps * 3)) throw new Error('Song is too short to analyze');

  // Log-spaced bands, 30 Hz – 11 kHz.
  const binHz = sr / N;
  const NB = 40, fMin = 30, fMax = Math.min(11000, sr / 2 - binHz);
  const bands = [];
  for (let i = 0; i < NB; i++) {
    const f0 = fMin * Math.pow(fMax / fMin, i / NB);
    const f1 = fMin * Math.pow(fMax / fMin, (i + 1) / NB);
    const lo = Math.max(1, Math.floor(f0 / binHz));
    const hi = Math.max(lo + 1, Math.floor(f1 / binHz));
    if (bands.length && lo < bands[bands.length - 1].hi) {
      bands[bands.length - 1].hi = Math.max(bands[bands.length - 1].hi, hi);
      bands[bands.length - 1].f1 = f1;
      continue;
    }
    bands.push({ lo, hi, f1 });
  }
  const nb = bands.length;
  const lowCount = Math.max(1, bands.filter((b) => b.f1 <= 170).length);
  // Snare-ish body: ~170 Hz – 2.5 kHz.
  const midHi = Math.max(lowCount + 1, bands.filter((b) => b.f1 <= 2500).length);

  const tab = fftSetup(N);
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const re = new Float32Array(N), im = new Float32Array(N);
  let prev = new Float32Array(nb), cur = new Float32Array(nb);
  const onset = new Float32Array(nFrames);
  const low = new Float32Array(nFrames);
  const mid = new Float32Array(nFrames);

  for (let t = 0; t < nFrames; t++) {
    const off = t * H;
    for (let i = 0; i < N; i++) { re[i] = x[off + i] * win[i]; im[i] = 0; }
    fft(tab, re, im);
    let f = 0, fl = 0, fm = 0;
    for (let b = 0; b < nb; b++) {
      const { lo, hi } = bands[b];
      let s = 0;
      for (let k = lo; k < hi; k++) s += Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      const v = Math.log1p((10 * s) / (hi - lo));
      cur[b] = v;
      const d = v - prev[b];
      if (t > 0 && d > 0) {
        f += d;
        if (b < lowCount) fl += d;
        else if (b < midHi) fm += d;
      }
    }
    onset[t] = f / nb;
    low[t] = fl / lowCount;
    mid[t] = fm / (midHi - lowCount);
    const tmp = prev; prev = cur; cur = tmp;
    if ((t & 1023) === 0) progress((t / nFrames) * 0.85);
  }

  // Frame t's flux peaks when an attack sits ~3/4 of the way into the window.
  const timeOf = (t) => (t * H + N * 0.75) / sr;

  const o = normalizeStd(onset);
  const period = estimatePeriod(o, fps);
  progress(0.9);
  const { beats, local } = trackBeats(o, period);
  progress(0.97);

  // Strength of each beat, relative to the song's typical beat.
  const beatVal = beats.map((b) => maxAround(local, b, 2));
  const p90 = percentile(beatVal, 0.9) || 1;
  const beatStrength = beatVal.map((v) => Math.max(0.5, Math.min(1, 0.5 + (0.5 * v) / p90)));

  // Downbeat phase: bar starts usually have the kick and not the snare
  // (snares sit on beats 2 and 4).
  const lowB = beats.map((b) => maxAround(low, b, 3));
  const midB = beats.map((b) => maxAround(mid, b, 3));
  const meanOf = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1) || 1;
  const lm = meanOf(lowB), mm = meanOf(midB);
  const phaseSum = [0, 0, 0, 0];
  beats.forEach((_, i) => { phaseSum[i % 4] += lowB[i] / lm - 0.7 * (midB[i] / mm); });
  const downPhase = phaseSum.indexOf(Math.max(...phaseSum));

  const kicks = pickPeaks(low, fps).map((p) => [timeOf(p.t), p.z]);
  const hits = pickPeaks(onset, fps).map((p) => [timeOf(p.t), p.z]);

  progress(1);
  return {
    bpm: (60 * fps) / period,
    beats: beats.map(timeOf),
    beatStrength,
    downPhase,
    kicks,
    hits,
    duration: x.length / sr,
  };
}

// ───────────────────────── tempo ─────────────────────────

function estimatePeriod(o, fps) {
  const n = o.length;
  const minLag = Math.floor((fps * 60) / 200);
  const maxLag = Math.ceil((fps * 60) / 60);
  let m = 0;
  for (let i = 0; i < n; i++) m += o[i];
  m /= n;
  const ac = new Float64Array(maxLag + 2);
  for (let L = minLag - 1; L <= maxLag + 1; L++) {
    let s = 0;
    for (let t = L; t < n; t++) s += (o[t] - m) * (o[t - L] - m);
    ac[L] = s / (n - L);
  }
  let best = -Infinity, bestL = minLag;
  for (let L = minLag; L <= maxLag; L++) {
    const bpm = (60 * fps) / L;
    const w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120), 2));
    const s = ac[L] * w;
    if (s > best) { best = s; bestL = L; }
  }
  const a = ac[bestL - 1], b = ac[bestL], c = ac[bestL + 1];
  const den = a - 2 * b + c;
  const delta = den !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0;
  return bestL + delta;
}

// ───────────────────────── beat tracking ─────────────────────────

function trackBeats(o, period, tightness = 100) {
  const n = o.length;

  // Smooth the onset curve with a narrow Gaussian (width ~ period / 32).
  const half = Math.round(period);
  const kern = new Float32Array(2 * half + 1);
  for (let i = -half; i <= half; i++) kern[i + half] = Math.exp(-0.5 * Math.pow((i * 32) / period, 2));
  const local = new Float32Array(n);
  for (let t = 0; t < n; t++) {
    let s = 0;
    for (let i = -half; i <= half; i++) {
      const j = t + i;
      if (j >= 0 && j < n) s += o[j] * kern[i + half];
    }
    local[t] = s;
  }

  const wMin = Math.max(1, Math.round(period / 2));
  const wMax = Math.round(period * 2);
  const pen = new Float32Array(wMax + 1);
  for (let d = wMin; d <= wMax; d++) pen[d] = -tightness * Math.pow(Math.log(d / period), 2);

  let maxLocal = 0;
  for (let t = 0; t < n; t++) if (local[t] > maxLocal) maxLocal = local[t];
  const startThresh = 0.01 * maxLocal;

  const score = new Float32Array(n);
  const back = new Int32Array(n).fill(-1);
  let first = true;
  for (let t = 0; t < n; t++) {
    let best = -Infinity, bi = -1;
    for (let d = wMin; d <= wMax; d++) {
      const p = t - d;
      if (p < 0) break;
      const v = score[p] + pen[d];
      if (v > best) { best = v; bi = p; }
    }
    score[t] = local[t] + (bi >= 0 ? best : 0);
    if (first && local[t] < startThresh) back[t] = -1;
    else { back[t] = bi; first = false; }
  }

  // Last beat: the latest local max of the cumulative score that is still strong.
  const maxima = [];
  for (let t = 1; t < n - 1; t++) if (score[t] > score[t - 1] && score[t] >= score[t + 1]) maxima.push(t);
  let last = n - 1;
  if (maxima.length) {
    const med = percentile(maxima.map((t) => score[t]), 0.5);
    for (let i = maxima.length - 1; i >= 0; i--) if (score[maxima[i]] >= 0.5 * med) { last = maxima[i]; break; }
  }

  let beats = [];
  for (let t = last; t >= 0; t = back[t]) beats.push(t);
  beats.reverse();

  // Trim weak beats from the start and end (silence, fades).
  if (beats.length > 4) {
    let ms = 0;
    for (const b of beats) ms += local[b] * local[b];
    const thr = 0.5 * Math.sqrt(ms / beats.length);
    let a = 0, z = beats.length;
    while (a < z && local[beats[a]] <= thr) a++;
    while (z > a && local[beats[z - 1]] <= thr) z--;
    beats = beats.slice(a, z);
  }
  return { beats, local };
}

// ───────────────────────── peaks ─────────────────────────

// Local maxima, scored by how far they stand above the surrounding ±0.5 s.
function pickPeaks(e, fps) {
  const n = e.length;
  const w = Math.round(fps * 0.5);
  const near = 3;
  const minGap = Math.round(fps * 0.09);
  const ps = new Float64Array(n + 1), ps2 = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { ps[i + 1] = ps[i] + e[i]; ps2[i + 1] = ps2[i] + e[i] * e[i]; }
  const floor = 0.1 * percentile(Array.from(e).filter((v) => v > 0), 0.95);
  const peaks = [];
  for (let t = 1; t < n - 1; t++) {
    const v = e[t];
    if (v <= floor) continue;
    let isMax = true;
    for (let j = Math.max(0, t - near); j <= Math.min(n - 1, t + near); j++) {
      if (j !== t && (e[j] > v || (j < t && e[j] === v))) { isMax = false; break; }
    }
    if (!isMax) continue;
    const lo = Math.max(0, t - w), hi = Math.min(n, t + w + 1), cnt = hi - lo;
    const mean = (ps[hi] - ps[lo]) / cnt;
    const sd = Math.sqrt(Math.max(0, (ps2[hi] - ps2[lo]) / cnt - mean * mean));
    const z = (v - mean) / (sd + 1e-9);
    if (z < 0.3) continue;
    const lastP = peaks[peaks.length - 1];
    if (lastP && t - lastP.t < minGap) {
      if (z > lastP.z) peaks[peaks.length - 1] = { t, z };
      continue;
    }
    peaks.push({ t, z });
  }
  return peaks;
}

// ───────────────────────── helpers ─────────────────────────

function normalizeStd(a) {
  let m = 0;
  for (let i = 0; i < a.length; i++) m += a[i];
  m /= a.length;
  let v = 0;
  for (let i = 0; i < a.length; i++) v += (a[i] - m) ** 2;
  const sd = Math.sqrt(v / Math.max(1, a.length - 1)) || 1;
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] / sd;
  return out;
}

function maxAround(a, t, r) {
  let m = -Infinity;
  for (let i = Math.max(0, t - r); i <= Math.min(a.length - 1, t + r); i++) if (a[i] > m) m = a[i];
  return m;
}

function percentile(arr, q) {
  if (!arr.length) return 0;
  const s = Array.from(arr).sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))];
}

function fftSetup(n) {
  const levels = Math.round(Math.log2(n));
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let j = 0, x = i; j < levels; j++, x >>= 1) r = (r << 1) | (x & 1);
    rev[i] = r;
  }
  const cos = new Float32Array(n / 2), sin = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = Math.sin((2 * Math.PI * i) / n); }
  return { n, rev, cos, sin };
}

function fft({ n, rev, cos, sin }, re, im) {
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) {
      let a = re[i]; re[i] = re[j]; re[j] = a;
      a = im[i]; im[i] = im[j]; im[j] = a;
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1, step = n / size;
    for (let i = 0; i < n; i += size) {
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const a = i + j, b = a + half;
        const tr = re[b] * cos[k] + im[b] * sin[k];
        const ti = im[b] * cos[k] - re[b] * sin[k];
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
      }
    }
  }
}

if (typeof module !== 'undefined') module.exports = { analyze };
