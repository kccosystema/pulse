# PulsePic

A phone app (PWA) that makes a picture pulse to the beat of a song.

Pick an image and a song, then tap **Start**. Your files stay on the device.

**Beat detection:** when you pick a song, it is analyzed once in the background (`beat-worker.js`). The analysis finds the tempo, a steady beat grid, the first beat of each bar, kick-drum hits and all hits, the same approach DJ and music-analysis software use. Playback then fires effects from that timeline, so they land on the beat instead of reacting late. If a song can't be decoded, it falls back to live bass detection.

**Controls:**
- **Sync to:** Beat (a steady grid, accented on bar starts), Kick, or All hits.
- **Sensitivity:** how many kicks or hits count (Kick and All hits modes).
- **Offset:** shifts the visuals later if they come before the sound, which is common with Bluetooth headphones (try +150 to +250 ms).
- **Effects:** Glow, Shake, Flash, Tilt, Bounce, Echo, Rings, Sparks, RGB split, Bars, Strobe (bar starts), Circle.
- **Presets:** Chill, Club, Hype.
- **Record:** saves or shares the result as a video (song name and artist included when shown).
- **Details:** song name, artist, album and artist website. These fill in from the song file's tags or a file name like `Artist - Song.mp3`.
- **Share:** uploads the cover and song and creates a link (`/s/<id>`) to a landing page. The page shows the pulsing picture with your effects, a Play button, the song details and the artist website. Texts and social apps show a preview card with the cover.
  Studio files (WAV, AIFF, FLAC) and anything over 40 MB are converted to a 192 kbps MP3 on the phone before uploading. That's about 7× smaller, so share pages load quickly. The cap is 15 minutes per song.

**Live:** https://pulsepic.com. Every push to `main` deploys automatically through Vercel.

## Files

| Path | What it is |
| --- | --- |
| `public/index.html`, `public/app.js` | Creator: pick image and song, effects, details, record, share |
| `public/engine.js` | Shared playback, beat sync, effects and rendering |
| `public/beat-worker.js` | Song analysis: tempo, beats, downbeats, kicks, hits |
| `public/view.js`, `public/view.css` | Share page player |
| `public/encode-worker.js` | Converts big or lossless songs to MP3 before sharing (LAME via WebAssembly) |
| `public/sw.js` | Offline cache. **Bump `VERSION` whenever you change a file in `public/`.** |
| `public/vendor/` | Bundled Vercel Blob upload client and MP3 encoder (`npm run vendor` regenerates them) |
| `api/upload.js` | Grants the browser permission to upload the cover and song straight to Vercel Blob |
| `api/share.js` | Checks and saves a share (details, effect settings, beat map) |
| `api/view.js` + `lib/view-template.js` | Renders `/s/<id>` with link-preview tags |
| `api/media.js` | Same-origin fallback for streaming a shared song |
| `api/config.js` | Tells the app whether sharing and sign-in are set up |
| `api/claim.js`, `api/links.js`, `api/cleanup.js` | Claim guest links, list and delete a user's links, daily expiry cleanup |
| `lib/auth.js`, `lib/shares.js` | Clerk token checks; share ownership, expiry and deletion |
| `public/auth.js` | Sign-in, account button and My links, keeping work across sign-in |

## Accounts and link expiry

Sign-in uses **Clerk** (Google, Apple and others, set up in the Clerk dashboard). Only Clerk's *publishable* key is needed: set `CLERK_PUBLISHABLE_KEY` in Vercel, or put it in `lib/auth.js`. The server checks sign-ins against Clerk's public signing keys, so there is no secret key.

- **Signed in:** share links are permanent and listed under **My links** (copy, open, delete).
- **Guest:** links last **30 days**. The browser keeps a secret claim token, so signing in later on the same device makes the guest's links permanent.
- **Daily cleanup:** a Vercel Cron job (`api/cleanup`, 04:23 UTC) deletes expired guest links with their song and cover. Set `CRON_SECRET` to stop anyone else from triggering it. It only ever deletes expired links, so being triggered extra times is harmless.
- **Sign-in leaves the page and comes back**, so the picture, song and details are saved in IndexedDB first and restored afterwards (`public/auth.js`).
- **No key set:** the account button is hidden and every link is a 30-day guest link.

Storage layout: `shares/<id>.json` (a share), `owners/<user>/<id>.json` (a user's links), `expiry/<date>/<id>` (guest links due on that date).

## Sharing storage

Shares are stored in a **Vercel Blob** store connected to this project. Connecting it adds `BLOB_READ_WRITE_TOKEN` to the project automatically. Without a store, everything works except **Share**, which says sharing isn't set up.

## Run locally

```bash
npm install
npm run dev   # http://localhost:4400, sharing saved to .data/ instead of Vercel Blob
```
