# Pulse

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

**Live:** https://pulse-three-ruddy-23.vercel.app. Every push to `main` deploys automatically through Vercel.

## Files

| Path | What it is |
| --- | --- |
| `public/index.html`, `public/app.js` | Creator: pick image and song, effects, details, record, share |
| `public/engine.js` | Shared playback, beat sync, effects and rendering |
| `public/beat-worker.js` | Song analysis: tempo, beats, downbeats, kicks, hits |
| `public/view.js`, `public/view.css` | Share page player |
| `public/sw.js` | Offline cache. **Bump `VERSION` whenever you change a file in `public/`.** |
| `public/vendor/blob-client.js` | Bundled Vercel Blob upload client (`npm run vendor` regenerates it) |
| `api/upload.js` | Grants the browser permission to upload the cover and song straight to Vercel Blob |
| `api/share.js` | Checks and saves a share (details, effect settings, beat map) |
| `api/view.js` + `lib/view-template.js` | Renders `/s/<id>` with link-preview tags |
| `api/media.js` | Same-origin fallback for streaming a shared song |
| `api/config.js` | Tells the app whether sharing is set up |

## Sharing storage

Shares are stored in a **Vercel Blob** store connected to this project. Connecting it adds `BLOB_READ_WRITE_TOKEN` to the project automatically. Without a store, everything works except **Share**, which says sharing isn't set up.

## Run locally

```bash
npm install
npm run dev   # http://localhost:4400, sharing saved to .data/ instead of Vercel Blob
```
