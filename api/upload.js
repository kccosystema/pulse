// Lets the browser upload the cover and song straight to Vercel Blob with a
// short-lived presigned URL (files never pass through this function, so the
// 4.5 MB function body limit doesn't apply). Each URL is limited to one
// pathname under media/, the expected file types and a size cap.
import { handleUploadPresigned } from '@vercel/blob/client';
import { storageMode, blobAuth, issueSignedToken } from '../lib/storage.js';
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
  // Only presigned-URL requests are served. Upload-completed callbacks aren't
  // used by this app, so they're refused here; the webhook key the SDK insists
  // on is only consulted for those callbacks and is never used.
  if (body?.type !== 'blob.generate-presigned-url') return json({ error: 'Unsupported request' }, 400);
  const auth = blobAuth(request);
  try {
    const result = await handleUploadPresigned({
      body,
      request,
      webhookPublicKey: process.env.BLOB_WEBHOOK_PUBLIC_KEY || 'unused-no-upload-callbacks',
      getSignedToken: async (pathname) => {
        const m = /^media\/(img|audio)\/[a-z0-9][a-z0-9._-]{0,80}$/i.exec(pathname);
        if (!m) throw new Error('Invalid file name');
        const rule = RULES[m[1]];
        const validUntil = Date.now() + 15 * 60 * 1000;
        const token = await issueSignedToken({
          ...auth,
          pathname,
          operations: ['put'],
          allowedContentTypes: rule.types,
          maximumSizeInBytes: rule.max,
          validUntil,
        });
        return {
          token,
          urlOptions: {
            validUntil,
            allowedContentTypes: rule.types,
            maximumSizeInBytes: rule.max,
            addRandomSuffix: true,
            allowOverwrite: false,
            cacheControlMaxAge: 60 * 60 * 24 * 365,
          },
        };
      },
    });
    return json(result);
  } catch (err) {
    console.error('upload token failed', err);
    return json({ error: err.message || 'Upload not allowed' }, 400);
  }
}
