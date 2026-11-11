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
  <nav aria-label="Site"><a href="/blog">Blog</a><a href="/about">About</a><a class="b-try" href="/">Try it free</a></nav>
</header>`;

const footer = `<footer class="b-foot">
  <p><b>PulsePic</b> makes any picture pulse to the beat of a song. Free, on your phone, nothing to install.</p>
  <p><a href="/">Home</a> · <a href="/blog">Blog</a> · <a href="/about">About</a> · <a href="/terms">Terms</a> · <a href="/blog/feed.xml">RSS</a></p>
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

function aboutPage() {
  const title = 'About PulsePic: Why I Built It';
  const description = 'I got tired of paying weekly subscription fees for simple phone apps, so I built my own. PulsePic is my free replacement for BeatLeap.';
  const page = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: title,
    description,
    url: `${SITE}/about`,
    publisher,
    mainEntity: { '@type': 'WebApplication', name: NAME, url: SITE, applicationCategory: 'MultimediaApplication', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } },
  };
  const crumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'PulsePic', item: SITE },
      { '@type': 'ListItem', position: 2, name: 'About', item: `${SITE}/about` },
    ],
  };
  return `${head({ title, description, canonical: `${SITE}/about`, type: 'website', extra: `${ld(page)}\n${ld(crumbs)}\n` })}
<body>
${topBar}
<main class="b-main">
  <article>
    <header class="b-head">
      <p class="b-kicker">About</p>
      <h1>Why I built PulsePic</h1>
    </header>
    <section class="b-answer" aria-labelledby="qa">
      <h2 id="qa">In short</h2>
      <p>I got tired of paying weekly subscription fees for simple tools on my phone, so I started building my own. PulsePic is one of them: I made it to replace BeatLeap. It's free, it runs in your phone's browser, and there's nothing to install.</p>
    </section>
    <div class="b-body">
<h2>Tired of weekly app fees</h2>
<p>A lot of the apps on my phone had quietly turned into weekly subscriptions. Pay every week just to make a picture move to a song, trim a clip or add an effect. Those little charges add up fast, and most of these tools aren't doing anything a modern phone can't handle on its own.</p>
<p>So I started making my own versions of the tools I actually use. PulsePic is one of them. I built it to replace BeatLeap, the app I was paying for to make my pictures pulse to music.</p>

<h2>What PulsePic does</h2>
<p>Add a picture and a song. PulsePic <a href="/blog/how-beat-detection-works">finds the beat</a>, brings your picture to life with <a href="/blog/beat-synced-effects-and-presets">beat-synced effects</a>, and lets you <a href="/blog/instagram-reels-stories-video">save a video for Reels, Stories or TikTok</a> or <a href="/blog/share-song-link-with-artist-info">share a link</a> with your song and artist info. Everything happens on your phone until you choose to share.</p>

<h2>More features are coming</h2>
<p>PulsePic is still growing, and more features are coming soon. If there's something you'd love to see, keep an eye on the <a href="/blog">blog</a> for what's new.</p>

<h2>Will it stay free?</h2>
<p>That's the plan. I'll do my best to keep PulsePic free. No weekly fees, no subscriptions. It's 100% free to use… until the hosting bill says otherwise.</p>
    </div>
    ${cta}
  </article>
</main>
${footer}
</body>
</html>
`;
}

const TERMS_UPDATED = '2026-11-11';
function termsPage() {
  const title = 'Terms & Copyright | PulsePic';
  const description = 'Plain-English terms for PulsePic: you keep all rights to your music and art, we never sell or reuse it, and how to report or take down a page.';
  const page = { '@context': 'https://schema.org', '@type': 'WebPage', name: 'Terms & Copyright', description, url: `${SITE}/terms`, publisher, dateModified: TERMS_UPDATED };
  return `${head({ title, description, canonical: `${SITE}/terms`, type: 'website', extra: `${ld(page)}\n` })}
<body>
${topBar}
<main class="b-main">
  <article>
    <header class="b-head">
      <p class="b-kicker">Terms &amp; Copyright</p>
      <h1>Your music stays yours</h1>
      <p class="b-meta">Last updated <time datetime="${TERMS_UPDATED}">${longDate(TERMS_UPDATED)}</time></p>
    </header>
    <section class="b-answer" aria-labelledby="qa">
      <h2 id="qa">In short</h2>
      <p>You keep every right to the music and pictures you use with PulsePic. Your files stay on your phone unless you create a share link, and then they are stored only to play that page. We never sell, license or reuse your work. If a page uses your music or art without permission, tap Report on it and we will take it down.</p>
    </section>
    <div class="b-body">
<h2>You own your work</h2>
<p>Using PulsePic doesn’t give us any ownership of your songs, pictures, artist details or anything else you add. You keep all rights.</p>

<h2>What we store, and why</h2>
<ul>
  <li><strong>Making visuals and videos</strong>: happens on your phone. Nothing is uploaded.</li>
  <li><strong>Share links</strong>: when you tap Create link, a copy of the picture (resized) and the song (compressed if needed), plus the details and effect settings you chose, are stored so the share page can play them. Anyone with the link can open that page.</li>
  <li><strong>Accounts</strong>: if you sign in with Google or Apple, we keep your name, email and profile picture to run your account, your saved artists and your links.</li>
  <li><strong>Comments and likes</strong>: comments show the name and picture from the commenter’s account. Likes and plays are counted without identifying who made them.</li>
</ul>

<h2>What we never do</h2>
<ul>
  <li>Sell, license or give your music or pictures to anyone.</li>
  <li>Reuse your work for anything other than playing your own share page, including advertising or training AI.</li>
  <li>Claim your work as ours or put it on other sites.</li>
</ul>

<h2>Only share what you have the rights to</h2>
<p>When you create a share link, you confirm that you own the music and picture or have permission to share them. Don’t upload anything that infringes someone else’s rights or that is hateful, harassing or illegal.</p>

<h2>Removing your content</h2>
<ul>
  <li>Delete any of your links at any time from <strong>My links</strong>. That removes the page, the picture, the song, its comments and its counts.</li>
  <li>Links made without an account are deleted automatically after 30 days.</li>
</ul>

<h2>Reporting a page and takedowns</h2>
<p>If a PulsePic page uses your music or art without permission, or breaks these rules, tap <strong>Report</strong> at the bottom of that page. Tell us what’s yours and, if you like, leave an email so we can follow up. We review every report and remove pages that infringe or break these rules. Accounts that repeatedly share other people’s work will be removed.</p>

<h2>Streaming links</h2>
<p>Artists can add “Listen on” buttons for Spotify, Apple Music, YouTube and SoundCloud. Those buttons only link to the artist’s pages on those services. PulsePic doesn’t copy, record or stream music from them.</p>

<h2>A free service</h2>
<p>PulsePic is free and provided as is. We work hard to keep it running and your links available, but we can’t promise it will always be available or error-free, and features may change. If we ever need to change these terms, we’ll update this page and the date above.</p>
    </div>
    ${cta}
  </article>
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
    { loc: `${SITE}/about`, lastmod: latest, pri: '0.5' },
    { loc: `${SITE}/terms`, lastmod: latest, pri: '0.3' },
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

- [Terms & Copyright](${SITE}/terms): users keep all rights; files are stored only to play their share page; never sold or reused; report/takedown via the Report link on any share page.
- [About PulsePic](${SITE}/about): built as a free replacement for weekly-subscription phone apps like BeatLeap; more features coming; the aim is to keep it free.
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
mkdirSync(join(PUB, 'about'), { recursive: true });
writeFileSync(join(PUB, 'about', 'index.html'), aboutPage());
mkdirSync(join(PUB, 'terms'), { recursive: true });
writeFileSync(join(PUB, 'terms', 'index.html'), termsPage());
writeFileSync(join(BLOG, 'feed.xml'), feed());
writeFileSync(join(PUB, 'sitemap.xml'), sitemap());
writeFileSync(join(PUB, 'robots.txt'), robots);
writeFileSync(join(PUB, 'llms.txt'), llms());
console.log(`Built ${posts.length} posts + index, about, terms, feed.xml, sitemap.xml, robots.txt, llms.txt`);
