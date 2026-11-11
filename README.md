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
- **🎬 Video (export):** 1080p MP4 in **Story/Reel 9:16**, **Square 1:1** or **Feed 4:5**, for **15/30/60/90 s or the full song**, starting wherever the song is. It renders off-screen at full resolution, **faster than real time** where the phone has a hardware encoder (`public/fast-export.js`: WebCodecs H.264 + AAC, muxed to MP4 with Mediabunny; a WebAssembly AAC encoder add-on fills in where the browser lacks AAC). Phones without hardware encoding fall back to real-time recording (`exportVideo` in `engine.js`); that is detected in the first 1.5 s and remembered. There's a live preview and cancel, and it and keeps the picture and credits clear of Instagram's interface. There's an optional "Made with PulsePic.com" line. **Share / Save video** opens the phone's share sheet (Instagram, Save to Photos). Instagram needs H.264 MP4, which Safari on iOS and Chrome on Android produce; other browsers get a warning.
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
| `public/vendor/` | Bundled Vercel Blob upload client, MP3 encoder, Mediabunny and its AAC encoder (`npm run vendor` regenerates them) |
| `api/upload.js` | Grants the browser permission to upload the cover and song straight to Vercel Blob |
| `api/share.js` | Checks and saves a share (details, effect settings, beat map) |
| `api/view.js` + `lib/view-template.js` | Renders `/s/<id>` with link-preview tags |
| `api/media.js` | Same-origin fallback for streaming a shared song |
| `api/config.js` | Tells the app whether sharing and sign-in are set up |
| `api/plays.js`, `lib/counter.js`, `lib/db.js` | Play counts in Postgres |
| `api/admin.js`, `lib/admin*.js`, `public/admin/` | Admin dashboard (admin email only). One function behind `/api/admin/<section>`, because Vercel Hobby allows 12 functions |
| `api/me.js`, `api/track.js`, `lib/analytics.js` | User records and privacy-friendly event counts |
| `api/links.js`, `api/cleanup.js` | List, delete and claim a user's links; daily expiry cleanup |
| `lib/auth.js`, `lib/shares.js` | Clerk token checks; share ownership, expiry and deletion |
| `public/auth.js` | Sign-in, account button and My links, keeping work across sign-in |

## Desktop visitors

PulsePic is phone- and tablet-only. A small script in `index.html` runs before anything renders and marks desktops and laptops (no mobile browser, not an iPad, mouse or trackpad as the main pointer) with `html.desktop`. They get a "Made for your phone" page instead of the app: the animated artwork, a QR code to `pulsepic.com` (`npm run qr` regenerates `public/img/qr-pulsepic.svg`), a features grid and the Fresh slider. On desktop, sign-in never loads and the app never starts. **Share pages (`/s/…`) and `/admin` still work on desktop.** This is a front-end gate only; the APIs don't check the device.

## Home page slider

"Fresh on PulsePic" under the Try now arrow: an endless row of the newest 24 songs (`api/recent.js`, cached at the edge for 5 minutes). Each cover opens its share page in a new tab. Creators can opt out with **Show on the PulsePic homepage** in Share or Edit (`featured` on the share). Expired links are never shown. With reduced motion it becomes a swipeable row.

## Accounts and link expiry

Sign-in uses **Clerk** (Google, Apple and others, set up in the Clerk dashboard). Only Clerk's *publishable* key is needed: set `CLERK_PUBLISHABLE_KEY` in Vercel, or put it in `lib/auth.js`. The server checks sign-ins against Clerk's public signing keys, so there is no secret key.

- **Signed in:** share links are permanent and listed under **My links** (copy, open, delete).
- **Guest:** links last **30 days**. The browser keeps a secret claim token, so signing in later on the same device makes the guest's links permanent.
- **Editing:** **My links → Edit** reopens a link in the player. You can change the details, effects and picture, and **Save** updates the same link in place (`PATCH /api/share`, owner only). The song and its beat map stay the same.
- **Play counts:** share pages show "This has been jammed X times!". A play counts after 5 s of listening, once per browser per day. Counts live in **Neon Postgres** (Vercel → Storage → Neon, which sets `DATABASE_URL`; the `plays` table is created on first use) Without it, the badge is hidden.
- **Daily cleanup:** a Vercel Cron job (`api/cleanup`, 04:23 UTC) deletes expired guest links with their song and cover. Set `CRON_SECRET` to stop anyone else from triggering it. It only ever deletes expired links, so being triggered extra times is harmless.
- **Sign-in leaves the page and comes back**, so the picture, song and details are saved in IndexedDB first and restored afterwards (`public/auth.js`).
- **No key set:** the account button is hidden and every link is a 30-day guest link.

Storage layout: `shares/<id>.json` (a share), `owners/<user>/<id>.json` (a user's links), `expiry/<date>/<id>` (guest links due on that date).

## Admin

**`/admin`** (not linked from the app; `noindex`) shows analytics, every song (plays, owner, open/copy/delete) and every user (links, plays, joined, last seen). Every `/api/admin/*` call checks on the server that the caller's **verified Clerk email** is in `ADMIN_EMAILS` (default in `lib/auth.js`). This needs the email in Clerk's session token: **Clerk dashboard → Sessions → Customize session token**:

```json
{ "email": "{{user.primary_email_address}}", "name": "{{user.full_name}}", "image_url": "{{user.image_url}}" }
```

- **Users:** recorded in Postgres (`users` table) when a signed-in person opens the app (`api/me.js`). People who only signed in before this existed show up once they return.
- **Analytics:** `events` table (`lib/analytics.js`). It stores the event type (home/share page view, play, link created, export, sign-up), the share/user id, the country from Vercel's edge, and phone vs desktop. There are no cookies, IPs or browser strings, and bots are skipped.
- **Database:** `lib/db.js` uses Neon (`DATABASE_URL`) in production, or a local Postgres when `DATABASE_URL` points at localhost. Tables are created on first use.

## Sharing storage

Shares are stored in a **Vercel Blob** store connected to this project. Connecting it adds `BLOB_READ_WRITE_TOKEN` to the project automatically. Without a store, everything works except **Share**, which says sharing isn't set up.

## Run locally

```bash
npm install
npm run dev   # http://localhost:4400, sharing saved to .data/ instead of Vercel Blob
```

## Blog

Static, SEO/AEO-friendly blog at `/blog`, one post per feature.

- Write or edit posts in `blog/posts.mjs` (each has a direct "Quick answer", question-style headings and FAQs). Keep claims true to the app.
- Run `npm run blog` to regenerate `public/blog/**`, `public/blog/feed.xml`, `public/sitemap.xml`, `public/robots.txt` and `public/llms.txt`, then commit the output (Vercel has no build step).
- Every post carries BlogPosting, BreadcrumbList and FAQPage structured data, a canonical URL, Open Graph tags and an RSS link. The blog isn't behind the desktop gate, so anyone can read it.

## Likes and comments (share pages)

Under the picture on every share page: a ♥ like button and a 💬 comments button.

- **Likes** (`/api/likes`): anyone can like, once per song per day. The browser keeps an anonymous visitor id; on top of that each network address can add at most 5 likes per song per day, so clearing the browser doesn't allow spamming. Only salted, date-scoped hashes are stored (never raw addresses), and the daily cron prunes them after two days. Optional `PULSE_HASH_SALT` env var sets the salt.
- **Comments** (`/api/comments`): anyone can read; posting needs sign-in (Clerk loads only when the comments sheet opens). Up to 500 characters, one comment per 10 s and 30 per day per user. Shown with the commenter's account name and picture. The author, the song's owner or an admin can delete a comment.
- Stored in Postgres (`likes`, `like_marks`, `like_ips`, `comments`; created automatically). Deleting a link deletes its likes and comments. The admin Songs list shows likes and comments and can sort by them.
