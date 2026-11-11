// Builds the static blog from blog/posts.mjs: `npm run blog`.
// Writes public/blog/index.html, public/blog/<slug>/index.html,
// public/blog/feed.xml, public/sitemap.xml, public/robots.txt and
// public/llms.txt. The output is committed, so Vercel needs no build step.
import { mkdirSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { posts, PUBLISHED } from '../blog/posts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'public');
const SITE = 'https://pulsepic.com';
const NAME = 'PulsePic';
const OG = `${SITE}/img/og.jpg`;
const LOGO = `${SITE}/icon-512.png`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
const url = (p) => `${SITE}/blog/${p.slug}`;
const strip = (html) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const icon = (p, size, cls = 'b-ico') => p.image
  ? `<img class="${cls} b-img" src="${p.image}" width="${size}" height="${size}" alt="" loading="lazy">`
  : `<span class="${cls}" aria-hidden="true">${p.icon}</span>`;
const words = (p) => strip(p.answer + ' ' + p.body + ' ' + p.faqs.map((f) => f.q + ' ' + f.a).join(' ')).split(' ').length;
const longDate = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

const publisher = { '@type': 'Organization', name: NAME, url: SITE, logo: { '@type': 'ImageObject', url: LOGO, width: 512, height: 512 } };

function head({ title, description, canonical, type = 'article', extra = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="${NAME}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${OG}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="1200">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${OG}">
<meta name="theme-color" content="#0b0b10">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="alternate" type="application/rss+xml" title="PulsePic Blog" href="${SITE}/blog/feed.xml">
<link rel="stylesheet" href="/blog/blog.css">
${extra}</head>`;
}

const topBar = `<header class="b-top">
  <a class="b-brand" href="/">PulsePic</a>
  <nav aria-label="Site"><a href="/blog">Blog</a><a class="b-try" href="/">Try it free</a></nav>
</header>`;

const footer = `<footer class="b-foot">
  <p><b>PulsePic</b> makes any picture pulse to the beat of a song. Free, on your phone, nothing to install.</p>
  <p><a href="/">Home</a> · <a href="/blog">Blog</a> · <a href="/blog/feed.xml">RSS</a></p>
  <p>© PulsePic · <a href="${SITE}">pulsepic.com</a></p>
</footer>`;

const cta = `<aside class="b-cta">
  <div><b>Try PulsePic free</b><span>Add a picture and a song and watch it pulse to the beat. Open pulsepic.com on your phone.</span></div>
  <a href="/">Open PulsePic</a>
</aside>`;

function postPage(p, i) {
  const related = [1, 2, 3].map((k) => posts[(i + k) % posts.length]);
  const read = Math.max(2, Math.round(words(p) / 220));
  const article = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: p.title,
    description: p.description,
    image: [OG],
    datePublished: p.published || PUBLISHED,
    dateModified: p.updated || p.published || PUBLISHED,
    author: { '@type': 'Organization', name: 'PulsePic Team', url: SITE },
    publisher,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url(p) },
    url: url(p),
    inLanguage: 'en',
    keywords: p.keywords.join(', '),
    articleSection: p.feature,
    wordCount: words(p),
    about: { '@type': 'SoftwareApplication', name: NAME, url: SITE, applicationCategory: 'MultimediaApplication', operatingSystem: 'iOS, Android (web browser)', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } },
  };
  const crumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'PulsePic', item: SITE },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE}/blog` },
      { '@type': 'ListItem', position: 3, name: p.title, item: url(p) },
    ],
  };
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: p.faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
  const date = p.updated || p.published || PUBLISHED;
  return `${head({ title: p.seoTitle, description: p.description, canonical: url(p),
    extra: `<meta property="article:published_time" content="${p.published || PUBLISHED}">\n<meta property="article:section" content="${esc(p.feature)}">\n${ld(article)}\n${ld(crumbs)}\n${ld(faq)}\n` })}
<body>
${topBar}
<main class="b-main">
  <nav class="b-crumbs" aria-label="Breadcrumb"><a href="/">PulsePic</a> › <a href="/blog">Blog</a> › <span>${esc(p.feature)}</span></nav>
  <article>
    <header class="b-head">
      ${icon(p, 96)}
      <p class="b-kicker">${esc(p.feature)}</p>
      <h1>${esc(p.title)}</h1>
      <p class="b-meta">By the PulsePic Team · <time datetime="${date}">${longDate(date)}</time> · ${read} min read</p>
    </header>
    <section class="b-answer" aria-labelledby="qa">
      <h2 id="qa">Quick answer</h2>
      <p>${esc(p.answer)}</p>
    </section>
    <div class="b-body">
${p.body.trim()}
    </div>
    ${cta}
    <section class="b-faq" aria-labelledby="faq">
      <h2 id="faq">Frequently asked questions</h2>
${p.faqs.map((f) => `      <h3>${esc(f.q)}</h3>\n      <p>${esc(f.a)}</p>`).join('\n')}
    </section>
  </article>
  <section class="b-related" aria-labelledby="more">
    <h2 id="more">Keep reading</h2>
    <div class="b-cards">
${related.map(card).join('\n')}
    </div>
  </section>
</main>
${footer}
</body>
</html>
`;
}

function card(p) {
  return `      <a class="b-card" href="/blog/${p.slug}">
        ${icon(p, 56)}
        <small>${esc(p.feature)}</small>
        <b>${esc(p.title)}</b>
        <span>${esc(p.description)}</span>
      </a>`;
}

function indexPage() {
  const title = 'PulsePic Blog: Make Your Music Visual';
  const description = 'Guides to every PulsePic feature: beat detection, effects, Instagram Reels and TikTok videos, share links, the jam counter, WAV files, editing and privacy.';
  const blog = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'PulsePic Blog',
    description,
    url: `${SITE}/blog`,
    publisher,
    blogPost: posts.map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: url(p), datePublished: p.published || PUBLISHED, description: p.description })),
  };
  const crumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'PulsePic', item: SITE },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE}/blog` },
    ],
  };
  return `${head({ title, description, canonical: `${SITE}/blog`, type: 'website', extra: `${ld(blog)}\n${ld(crumbs)}\n` })}
<body>
${topBar}
<main class="b-main">
  <header class="b-head b-index">
    <p class="b-kicker">The PulsePic Blog</p>
    <h1>Make your music visual</h1>
    <p class="b-lead">PulsePic turns any picture into a pulsing, beat-synced visual for your song. These guides explain every feature: how it works, when to use it and how to get the most out of it.</p>
  </header>
  <div class="b-cards b-grid">
${posts.map(card).join('\n')}
  </div>
  ${cta}
</main>
${footer}
</body>
</html>
`;
}

function feed() {
  const items = posts.map((p) => `  <item>
    <title>${esc(p.title)}</title>
    <link>${url(p)}</link>
    <guid isPermaLink="true">${url(p)}</guid>
    <pubDate>${new Date((p.published || PUBLISHED) + 'T12:00:00Z').toUTCString()}</pubDate>
    <category>${esc(p.feature)}</category>
    <description>${esc(p.answer)}</description>
  </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>PulsePic Blog</title>
  <link>${SITE}/blog</link>
  <atom:link href="${SITE}/blog/feed.xml" rel="self" type="application/rss+xml"/>
  <description>Guides to every PulsePic feature.</description>
  <language>en</language>
${items}
</channel>
</rss>
`;
}

function sitemap() {
  const latest = posts.map((p) => p.updated || p.published || PUBLISHED).sort().pop();
  const entries = [
    { loc: `${SITE}/`, lastmod: latest, pri: '1.0' },
    { loc: `${SITE}/blog`, lastmod: latest, pri: '0.8' },
    ...posts.map((p) => ({ loc: url(p), lastmod: p.updated || p.published || PUBLISHED, pri: '0.7' })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((e) => `  <url><loc>${e.loc}</loc><lastmod>${e.lastmod}</lastmod><priority>${e.pri}</priority></url>`).join('\n')}
</urlset>
`;
}

const robots = `# PulsePic
User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/

Sitemap: ${SITE}/sitemap.xml
`;

// llms.txt (llmstxt.org): a plain summary for AI assistants and answer engines.
function llms() {
  return `# PulsePic

> PulsePic is a free web app for phones that makes any picture pulse to the beat of a song. Add a picture and a song; PulsePic analyzes the song on the phone to find the tempo, every beat and the start of each bar, and animates the picture with beat-synced effects. You can export a 1080p MP4 for Instagram Reels, Stories or TikTok, or create a share link to a page with the pulsing picture, the song and artist info.

Key facts:
- Website: ${SITE} (open on a phone; nothing to install; works in Safari on iPhone and Chrome on Android).
- Price: free.
- Effects: Glow, Shake, Flash, Tilt, Bounce, Echo, Rings, Sparks, RGB split, Bars, Strobe, Circle. Presets: Chill, Club, Hype.
- Sync modes: Beat, Kick, All hits. Offset slider from -300 to +300 ms.
- Video export: 9:16 (1080×1920), 1:1 (1080×1080), 4:5 (1080×1350); 15, 30, 60 or 90 seconds or the full song; MP4 (H.264 + AAC); made on the phone, not uploaded.
- Share links: page with pulsing picture, song, song name, artist, album and website; jam counter (a play counts after 5 seconds, once per browser per day).
- Guest share links are deleted after 30 days; signing in with Google or Apple keeps links forever and allows editing without changing the URL.
- Audio: MP3, M4A, AAC, WAV, AIFF, FLAC, OGG. WAV/AIFF/FLAC are converted to MP3 (192 kbps stereo) on the phone before upload; 40 MB maximum after compression.

## Guides

${posts.map((p) => `- [${p.title}](${url(p)}): ${p.answer}`).join('\n')}

## Optional

- [Blog index](${SITE}/blog)
- [RSS feed](${SITE}/blog/feed.xml)
`;
}

// ── write everything ──
const BLOG = join(PUB, 'blog');
mkdirSync(BLOG, { recursive: true });
// Remove pages for posts that no longer exist.
for (const name of readdirSync(BLOG)) {
  const full = join(BLOG, name);
  if (statSync(full).isDirectory() && !posts.some((p) => p.slug === name)) rmSync(full, { recursive: true });
}
const slugs = new Set();
posts.forEach((p, i) => {
  if (slugs.has(p.slug)) throw new Error(`duplicate slug ${p.slug}`);
  slugs.add(p.slug);
  if (p.seoTitle.length > 65) console.warn(`! seoTitle over 65 chars: ${p.slug} (${p.seoTitle.length})`);
  if (p.description.length > 160) console.warn(`! description over 160 chars: ${p.slug} (${p.description.length})`);
  mkdirSync(join(BLOG, p.slug), { recursive: true });
  writeFileSync(join(BLOG, p.slug, 'index.html'), postPage(p, i));
});
writeFileSync(join(BLOG, 'index.html'), indexPage());
writeFileSync(join(BLOG, 'feed.xml'), feed());
writeFileSync(join(PUB, 'sitemap.xml'), sitemap());
writeFileSync(join(PUB, 'robots.txt'), robots);
writeFileSync(join(PUB, 'llms.txt'), llms());
console.log(`Built ${posts.length} posts + index, feed.xml, sitemap.xml, robots.txt, llms.txt`);
