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
- **Record:** saves or shares the result as a video.

**Live:** https://pulse-three-ruddy-23.vercel.app. Every push to `main` deploys automatically through Vercel.

## Files

| File | What it is |
| --- | --- |
| `index.html` | Page markup |
| `style.css` | Styles |
| `app.js` | Playback, effects, canvas rendering, recording |
| `beat-worker.js` | Song analysis: tempo, beats, downbeats, kicks, hits |
| `sw.js` | Offline cache. **Bump `VERSION` whenever you change any file** so installed phones pick up the update. |
| `manifest.webmanifest`, `icon*` | Install / home-screen metadata |
| `vercel.json` | Static hosting config (no build step) |

## Run locally

Any static server works, for example `npx serve .`, then open the printed URL.
