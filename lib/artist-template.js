// Public artist page: pulsepic.com/a/<slug>. Everything user-provided is escaped.
import { cleanLinks, SERVICES } from './stream-links.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ld = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, (c) => (c === '\u2028' ? '\\u2028' : '\\u2029'));
const V = '2';

export function renderArtist(a, songs, origin) {
  const url = `${origin}/a/${a.slug}`;
  const cover = songs[0] && songs[0].image;
  const desc = (a.bio || `Listen to ${a.name} on PulsePic: ${songs.length} song${songs.length === 1 ? '' : 's'} with pulsing visuals.`).replace(/\s+/g, ' ').slice(0, 160);
  const links = cleanLinks(a.links);
  const listen = Object.keys(links).map((k) => `<a class="svc svc-${k}" href="${esc(links[k])}" target="_blank" rel="noopener">${esc(SERVICES[k].name)}</a>`).join('');
  const site = a.website ? `<a class="svc svc-site" href="${esc(a.website)}" target="_blank" rel="noopener">Website ↗</a>` : '';
  const total = songs.reduce((s, x) => s + (x.plays || 0), 0);
  const group = {
    '@context': 'https://schema.org', '@type': 'MusicGroup', name: a.name, url, description: desc,
    ...(cover ? { image: cover } : {}),
    sameAs: [a.website, ...Object.values(links)].filter(Boolean),
    track: songs.map((s) => ({ '@type': 'MusicRecording', name: s.title, url: `${origin}/s/${s.id}`, byArtist: a.name, ...(s.album ? { inAlbum: s.album } : {}) })),
  };
  const grid = songs.length
    ? songs.map((s) => `<a class="song" href="/s/${esc(s.id)}">
        <img src="${esc(s.image)}" alt="" loading="lazy" width="300" height="300">
        <b>${esc(s.title)}</b>
        <small>${s.album ? `${esc(s.album)} · ` : ''}🔥 ${Number(s.plays || 0).toLocaleString('en-US')}</small>
      </a>`).join('\n')
    : '<p class="empty">No songs yet. Check back soon.</p>';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(a.name)} · PulsePic</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="profile">
<meta property="og:site_name" content="PulsePic">
<meta property="og:title" content="${esc(a.name)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
${cover ? `<meta property="og:image" content="${esc(cover)}">\n<meta name="twitter:image" content="${esc(cover)}">` : ''}
<meta name="twitter:card" content="${cover ? 'summary_large_image' : 'summary'}">
<meta name="theme-color" content="#0b0b10">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="stylesheet" href="/artist.css?v=${V}">
<script type="application/ld+json">${ld(group)}</script>
</head>
<body>
${cover ? `<div class="bg" style="background-image:url('${esc(cover)}')"></div>` : '<div class="bg"></div>'}
<main class="wrap">
  <header class="head">
    ${cover ? `<img class="avatar" src="${esc(cover)}" alt="">` : `<span class="avatar ph">${esc(a.name.trim().charAt(0).toUpperCase())}</span>`}
    <h1>${esc(a.name)}</h1>
    <p class="stats">${songs.length} song${songs.length === 1 ? '' : 's'}${total ? ` · 🔥 ${total.toLocaleString('en-US')} jams` : ''}</p>
    ${a.bio ? `<p class="bio">${esc(a.bio)}</p>` : ''}
    ${listen || site ? `<div class="links">${listen}${site}</div>` : ''}
  </header>
  <section aria-label="Songs">
    <h2>Songs</h2>
    <div class="grid">
${grid}
    </div>
  </section>
  <footer class="foot">Made with <a href="/">PulsePic</a> · <a href="/">make your own</a></footer>
</main>
</body>
</html>`;
}
