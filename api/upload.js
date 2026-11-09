// Issues short-lived tokens so the browser can upload the cover and song
// straight to Vercel Blob (files never pass through this function, so the
// 4.5 MB function body limit doesn't apply).
import { handleUpload } from '@vercel/blob/client';
import { storageMode } from '../lib/storage.js';
import { json } from '../lib/http.js';

const MB = 1024 * 1024;
const RULES = {
  img: { types: ['image/jpeg', 'image/png', 'image/webp'], max: 10 * MB },
  audio: {
    types: ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/wav', 'audio/x-wav',
      'audio/wave', 'audio/ogg', 'audio/flac', 'audio/x-flac', 'audio/webm'],
    max: 40 * MB,
  },
};

export async function POST(request) {
  if (storageMode() !== 'blob') return json({ error: 'Sharing storage is not set up' }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const m = /^media\/(img|audio)\/[a-z0-9][a-z0-9._-]{0,80}$/i.exec(pathname);
        if (!m) throw new Error('Invalid file name');
        const rule = RULES[m[1]];
        return {
          allowedContentTypes: rule.types,
          maximumSizeInBytes: rule.max,
          addRandomSuffix: true,
          allowOverwrite: false,
          cacheControlMaxAge: 60 * 60 * 24 * 365,
        };
      },
    });
    return json(result);
  } catch (err) {
    return json({ error: err.message || 'Upload not allowed' }, 400);
  }
}
