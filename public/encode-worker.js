// Converts decoded PCM to MP3 off the main thread (LAME via WebAssembly,
// wasm-media-encoders, MIT). Used when sharing big or lossless songs.
'use strict';
importScripts('/vendor/mp3-encoder.js');

self.onmessage = async (e) => {
  const { channels, sampleRate, bitrate } = e.data;
  try {
    const enc = await WME.createEncoder('audio/mpeg', '/vendor/mp3.wasm');
    enc.configure({ channels: channels.length, sampleRate, bitrate });
    const total = channels[0].length;
    const CHUNK = 1152 * 64;
    const parts = [];
    for (let i = 0; i < total; i += CHUNK) {
      const end = Math.min(total, i + CHUNK);
      const out = enc.encode(channels.map((c) => c.subarray(i, end)));
      if (out.length) parts.push(out.slice()); // copy: out views WASM memory
      if ((i / CHUNK) % 8 === 0) self.postMessage({ type: 'progress', p: end / total });
    }
    const last = enc.finalize();
    if (last.length) parts.push(last.slice());
    self.postMessage({ type: 'done', blob: new Blob(parts, { type: 'audio/mpeg' }) });
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err && err.message) || err) });
  }
};
