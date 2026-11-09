# Pulse

A phone app (PWA) that makes a picture pulse to the beat of a song.

Pick an image and a song, then tap **Start**. Bass-band beat detection drives the pulse, with Glow, Shake, Flash and Round effects, Strength and Sensitivity sliders, and a **Record** button that saves or shares the result as a video. Your files stay on the device.

**Live:** https://pulse-rho-five-53.vercel.app. Every push to `main` deploys automatically through Vercel.

## Files

| File | What it is |
| --- | --- |
| `index.html` | Page markup |
| `style.css` | Styles |
| `app.js` | Beat detection, canvas rendering, recording |
| `sw.js` | Offline cache. **Bump `VERSION` whenever you change any file** so installed phones pick up the update. |
| `manifest.webmanifest`, `icon*` | Install / home-screen metadata |
| `vercel.json` | Static hosting config (no build step) |

## Run locally

Any static server works, for example `npx serve .`, then open the printed URL.
