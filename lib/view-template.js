// HTML for the share page. Everything user-provided is escaped; the
// manifest is embedded as JSON for public/view.js.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const jsonScript = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, (c) => (c === '\u2028' ? '\\u2028' : '\\u2029'));

const head = (title, extra = '') => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="theme-color" content="#0b0b10">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/view.css">
${extra}
</head>`;

export function renderView(m, origin) {
  const title = `${m.title} — ${m.artist}`;
  const desc = [m.album && `From “${m.album}”`, 'Listen with PulsePic'].filter(Boolean).join(' · ');
  const pageUrl = `${origin}/s/${m.id}`;
  const meta = `<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(pageUrl)}">
<meta property="og:type" content="music.song">
<meta property="og:site_name" content="PulsePic">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:image" content="${esc(m.image.url)}">
<meta property="og:image:width" content="${Math.round(m.image.width)}">
<meta property="og:image:height" content="${Math.round(m.image.height)}">
<meta property="og:image:alt" content="${esc(`Cover art for ${title}`)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(m.image.url)}">`;

  const site = m.website ? `<a class="btn" id="siteBtn" href="${esc(m.website)}" target="_blank" rel="noopener">Artist website ↗</a>` : '';
  return `${head(title, meta)}
<body class="view">
<canvas id="stage" aria-label="${esc(`Cover art for ${title}, pulsing to the music`)}"></canvas>

<button id="bigPlay" class="big-play" aria-label="Play ${esc(title)}"><span>▶</span></button>

<section id="card" class="panel bottom view-card">
  <div class="row">
    <button id="playBtn" class="round" aria-label="Play">▶</button>
    <div class="meta">
      <h1 id="songTitle">${esc(m.title)}</h1>
      <p>${esc(m.artist)}${m.album ? ` <span>· ${esc(m.album)}</span>` : ''}</p>
    </div>
  </div>
  <div class="row">
    <input type="range" id="seek" min="0" max="1000" value="0" aria-label="Seek">
    <span id="time" class="time">0:00</span>
  </div>
  <div class="row links">
    ${site}
    <button id="shareBtn">Share</button>
  </div>
  <p class="made">Made with <a href="/">PulsePic</a> · <a href="/">make your own</a></p>
</section>

<div id="toast" role="status" hidden></div>
<audio id="audio" preload="auto" playsinline crossorigin="anonymous"></audio>
<script id="pulse-data" type="application/json">${jsonScript(m)}</script>
<script src="/engine.js"></script>
<script src="/view.js"></script>
</body>
</html>`;
}

export function renderNotFound(msg = 'This song link doesn’t exist or was removed.') {
  return `${head('Song not found · PulsePic', '<meta name="robots" content="noindex">')}
<body class="view">
<main class="panel" id="setup">
  <h1>PulsePic</h1>
  <p class="sub">${esc(msg)}</p>
  <a class="btn accent" href="/">Make your own</a>
</main>
</body>
</html>`;
}
