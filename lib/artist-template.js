// Public artist page: pulsepic.com/a/<slug>. A streaming-app style page in
// PulsePic's own look: a big header picture with the name, Popular and
// Releases lists, About, and an in-page player. Tapping a song swaps the
// header for that song's live pulsing visual (public/artist.js + engine.js).
// Everything user-provided is escaped.
import { cleanLinks, SERVICES } from './stream-links.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ld = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, (c) => (c === '\u2028' ? '\\u2028' : '\\u2029'));
const V = '3';
const num = (n) => Number(n || 0).toLocaleString('en-US');
const year = (d) => { const y = new Date(d).getUTCFullYear(); return Number.isFinite(y) ? y : ''; };

export function renderArtist(a, songs, origin) {
  const url = `${origin}/a/${a.slug}`;
  const newest = songs[0];
  const hero = a.header || (newest && newest.image) || '';
  const total = songs.reduce((s, x) => s + (x.plays || 0), 0);
  const desc = (a.bio || `Listen to ${a.name} on PulsePic: ${songs.length} song${songs.length === 1 ? '' : 's'} with pulsing visuals.`).replace(/\s+/g, ' ').slice(0, 160);
  const links = cleanLinks(a.links);
  const listen = Object.keys(links).map((k) => `<a class="svc svc-${k}" href="${esc(links[k])}" target="_blank" rel="noopener">${esc(SERVICES[k].name)}</a>`).join('');
  const site = a.website ? `<a class="svc svc-site" href="${esc(a.website)}" target="_blank" rel="noopener">Website ↗</a>` : '';
  const popular = songs.slice().sort((x, y) => (y.plays || 0) - (x.plays || 0) || String(y.createdAt).localeCompare(String(x.createdAt)));
  const group = {
    '@context': 'https://schema.org', '@type': 'MusicGroup', name: a.name, url, description: desc,
    ...(hero ? { image: hero } : {}),
    sameAs: [a.website, ...Object.values(links)].filter(Boolean),
    track: songs.map((s) => ({ '@type': 'MusicRecording', name: s.title, url: `${origin}/s/${s.id}`, byArtist: a.name, ...(s.album ? { inAlbum: s.album } : {}) })),
  };
  const row = (s, i, list) => `<li class="track${i >= 5 && list === 'popular' ? ' extra' : ''}" data-id="${esc(s.id)}">
      <button type="button" class="play-row" data-list="${list}" data-id="${esc(s.id)}" aria-label="Play ${esc(s.title)}">
        <span class="n">${i + 1}</span>
        <img src="${esc(s.image)}" alt="" loading="lazy" width="56" height="56">
        <span class="t"><b>${esc(s.title)}</b><small>🔥 <span class="jams">${num(s.plays)}</span></small></span>
      </button>
      <a class="more" href="/s/${esc(s.id)}" aria-label="Open the ${esc(s.title)} song page">⋯</a>
    </li>`;
  const release = (s, i) => `<li class="release">
      <button type="button" class="play-row" data-list="releases" data-id="${esc(s.id)}" aria-label="Play ${esc(s.title)}">
        <img src="${esc(s.image)}" alt="" loading="lazy" width="112" height="112">
        <span class="t">${i === 0 ? '<small class="latest">Latest release</small>' : ''}<b>${esc(s.title)}</b><small>${s.album ? `${esc(s.album)} · ` : 'Single · '}${year(s.createdAt)}</small></span>
      </button>
    </li>`;
  const data = { name: a.name, url, songs: songs.map((s) => ({ id: s.id, title: s.title, album: s.album || '', image: s.image, plays: s.plays || 0 })), popular: popular.map((s) => s.id) };
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
${hero ? `<meta property="og:image" content="${esc(hero)}">\n<meta name="twitter:image" content="${esc(hero)}">` : ''}
<meta name="twitter:card" content="${hero ? 'summary_large_image' : 'summary'}">
<meta name="theme-color" content="#0b0b10">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="stylesheet" href="/artist.css?v=${V}">
<script type="application/ld+json">${ld(group)}</script>
</head>
<body class="artist">
<header class="hero" id="hero">
  <canvas id="stage" aria-label="${esc(a.name)} visual"></canvas>
  ${hero ? `<img id="heroImg" class="hero-img" src="${esc(hero)}" alt="">` : '<div id="heroImg" class="hero-img ph"></div>'}
  <div class="hero-shade"></div>
  <a class="brand" href="/">PulsePic</a>
  <div class="hero-text">
    <p class="now" id="nowLine" hidden>Now playing</p>
    <h1 id="heroTitle">${esc(a.name)}</h1>
  </div>
</header>

<main class="wrap">
  <section class="bar">
    <p class="stats">${total ? `🔥 ${num(total)} jams · ` : ''}${songs.length} song${songs.length === 1 ? '' : 's'}</p>
    <div class="controls">
      <button type="button" class="ghost" id="shareArtist">Share</button>
      <span class="spacer"></span>
      <button type="button" class="icon" id="shuffleBtn" aria-pressed="false" aria-label="Shuffle">
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M3 7h3.5c2 0 3.2 1 4.4 2.8l2.2 3.4C14.3 15 15.5 16 17.5 16H21M3 16h3.5c1.2 0 2.1-.4 2.9-1.1M14.6 8.1c.8-.7 1.7-1.1 2.9-1.1H21M18 4l3 3-3 3M18 13l3 3-3 3"/></svg>
      </button>
      <button type="button" class="big" id="bigPlay" aria-label="Play" ${songs.length ? '' : 'disabled'}><span id="bigIcon">▶</span></button>
    </div>
  </section>

  ${songs.length ? `<section aria-labelledby="popH">
    <h2 id="popH">Popular</h2>
    <ol class="tracks" id="popular">
${popular.map((s, i) => row(s, i, 'popular')).join('\n')}
    </ol>
    ${popular.length > 5 ? '<button type="button" class="pill" id="showMore">Show more</button>' : ''}
  </section>

  <section aria-labelledby="relH">
    <h2 id="relH">Releases</h2>
    <ol class="releases">
${songs.map(release).join('\n')}
    </ol>
  </section>` : '<p class="empty">No songs yet. Check back soon.</p>'}

  <section aria-labelledby="aboutH">
    <h2 id="aboutH">About</h2>
    <div class="about">
      ${hero ? `<img src="${esc(hero)}" alt="" loading="lazy">` : ''}
      <div class="about-body">
        <b>${esc(a.name)}</b>
        <small>${total ? `🔥 ${num(total)} jams` : `${songs.length} song${songs.length === 1 ? '' : 's'}`}</small>
        ${a.bio ? `<p class="bio" id="bio">${esc(a.bio)}</p><button type="button" class="linkish" id="bioMore" hidden>show more</button>` : ''}
        ${listen || site ? `<div class="links">${listen}${site}</div>` : ''}
      </div>
    </div>
  </section>

  <footer class="foot">Made with <a href="/">PulsePic</a> · <a href="/">make your own</a></footer>
</main>

<div class="nowbar" id="nowBar" hidden>
  <img id="nbImg" alt="">
  <div class="nb-text"><b id="nbTitle"></b><small>${esc(a.name)}</small></div>
  <a class="nb-open" id="nbOpen" href="#" aria-label="Open the song page">⋯</a>
  <button type="button" id="nbPlay" aria-label="Pause">❚❚</button>
  <button type="button" id="nbNext" aria-label="Next song">
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 5l10 7-10 7zM18 5v14"/></svg>
  </button>
  <div class="nb-progress"><span id="nbProgress"></span></div>
</div>

<div id="toast" role="status" hidden></div>
<audio id="audio" preload="auto" playsinline crossorigin="anonymous"></audio>
<script id="artist-data" type="application/json">${ld(data)}</script>
<script src="/engine.js?v=${V}"></script>
<script src="/artist.js?v=${V}"></script>
</body>
</html>`;
}
