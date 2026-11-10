'use strict';

// On desktop the hero artwork and the "Fresh" slider live in the desktop
// landing page instead (one copy of each; moved before anything starts).
if (document.documentElement.classList.contains('desktop')) {
  const art = document.querySelector('.hero-art');
  const fresh = document.getElementById('fresh');
  if (art) document.getElementById('dtArt').appendChild(art);
  if (fresh) document.getElementById('dtFresh').appendChild(fresh);
}

// Home page hero: the PulsePic artwork pulsing to a silent 120 BPM beat with
// the same kinds of effects the app makes (zoom, colour-cycling glow, rings,
// sparks on the downbeat). Pauses when scrolled away or the tab is hidden;
// shows a still image for people who prefer reduced motion.

(() => {
  const cvs = document.getElementById('heroCanvas');
  const img = document.getElementById('heroImg');
  if (!cvs || !img) return;
  const g = cvs.getContext('2d');
  const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const BPM = 120, SPB = 60 / BPM;
  let size = 0, dpr = 1, visible = true, running = false, t0 = performance.now(), last = t0, lastBeat = -1;
  let pulse = 0, flash = 0, hueIdx = 0;
  // Sunset palette to match the artwork: pinks, magentas, purples, oranges.
  const HUES = [325, 285, 20, 340, 265, 35, 310, 350];
  let hue = HUES[0];
  const rings = [], sparks = [];

  function fit() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    size = cvs.clientWidth || 360;
    cvs.width = Math.round(size * dpr);
    cvs.height = Math.round(size * dpr);
  }

  function rr(x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function onBeat(n, now) {
    const down = n % 4 === 0;
    pulse = down ? 1 : 0.7;
    hueIdx = (hueIdx + (down ? 3 : 1)) % HUES.length;
    hue = HUES[hueIdx];
    rings.push({ t: now, hue, s: pulse });
    if (down) {
      flash = 0.6;
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2, sp = 0.25 + Math.random() * 0.55;
        sparks.push({ a, x: Math.cos(a) * 0.36, y: Math.sin(a) * 0.36, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 0, max: 0.6 + Math.random() * 0.6, r: 1.5 + Math.random() * 3, hue: HUES[(hueIdx + 1 + (i % 3)) % HUES.length] });
      }
    }
    if (rings.length > 6) rings.shift();
  }

  function draw(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const beat = Math.floor((now - t0) / 1000 / SPB);
    if (!still && beat !== lastBeat) { lastBeat = beat; onBeat(beat, now); }
    pulse *= Math.exp(-dt / 0.14);
    flash *= Math.exp(-dt / 0.09);

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size, size);
    const c = size / 2;
    const base = size * 0.84;                      // artwork size at rest
    const s = still ? 1 : 1 + 0.07 * pulse;
    const w = base * s, r = base * 0.04 * s;

    // Rings behind the artwork.
    for (let i = rings.length - 1; i >= 0; i--) {
      const ring = rings[i];
      const age = (now - ring.t) / 750;
      if (age >= 1) { rings.splice(i, 1); continue; }
      const e = size * 0.075 * (1 - Math.pow(1 - age, 3)); // stays inside the canvas
      g.strokeStyle = `hsla(${ring.hue}, 95%, 65%, ${0.8 * (1 - age) * ring.s})`;
      g.lineWidth = 2 + 5 * (1 - age);
      rr(c - base / 2 - e, c - base / 2 - e, base + 2 * e, base + 2 * e, r + e);
      g.stroke();
    }

    // Artwork with a glow that changes colour on the beat.
    g.save();
    g.shadowColor = `hsla(${hue}, 95%, 60%, ${0.45 + 0.5 * pulse})`;
    g.shadowBlur = size * (0.05 + 0.1 * pulse);
    rr(c - w / 2, c - w / 2, w, w, r);
    g.fillStyle = '#000';
    g.fill();
    g.shadowBlur = 0;
    g.clip();
    if (img.complete && img.naturalWidth) g.drawImage(img, c - w / 2, c - w / 2, w, w);
    if (flash > 0.02) { g.fillStyle = `rgba(255,255,255,${0.18 * flash})`; g.fillRect(0, 0, size, size); }
    g.restore();

    // Sparks on the downbeat.
    if (sparks.length) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.life += dt;
        if (p.life >= p.max) { sparks.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt + 0.15 * dt * p.life;
        const f = 1 - p.life / p.max;
        g.fillStyle = `hsla(${p.hue}, 100%, 65%, ${f})`;
        g.beginPath();
        g.arc(c + p.x * size, c + p.y * size, p.r * (0.5 + 0.5 * f), 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }

    if (running) requestAnimationFrame(draw);
  }

  function start() {
    if (running || !visible || document.hidden || !document.body.classList.contains('home')) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(draw);
  }
  const stop = () => { running = false; };

  const begin = () => {
    fit();
    if (still) { draw(performance.now()); return; }
    start();
  };
  if (img.complete && img.naturalWidth) begin(); else img.addEventListener('load', begin, { once: true });

  window.addEventListener('resize', () => { fit(); if (still) draw(performance.now()); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); }).observe(cvs);
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  // Stop while the player is open; resume on the way back.
  new MutationObserver(() => (document.body.classList.contains('home') ? (fit(), start()) : stop()))
    .observe(document.body, { attributes: true, attributeFilter: ['class'] });
})();

// ───────── "Fresh on PulsePic": endless row of the newest songs ─────────
(async () => {
  const section = document.getElementById('fresh');
  const track = document.getElementById('freshTrack');
  if (!section || !track) return;
  let songs = [];
  try { songs = (await fetch('/api/recent').then((r) => r.json())).songs || []; } catch {}
  if (!songs.length) return;

  const card = (s, copy) => {
    const a = document.createElement('a');
    a.className = 'fresh-card';
    a.href = `/s/${encodeURIComponent(s.id)}`;
    a.target = '_blank';
    a.rel = 'noopener';
    if (copy) { a.tabIndex = -1; a.setAttribute('aria-hidden', 'true'); }
    a.setAttribute('aria-label', `${s.title} by ${s.artist} (opens in a new tab)`);
    const img = document.createElement('img');
    img.src = s.image; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.width = 150; img.height = 150;
    const t = document.createElement('b'); t.textContent = s.title;
    const ar = document.createElement('span'); ar.textContent = s.artist;
    a.append(img, t, ar);
    return a;
  };

  // Repeat the list until one set is wider than the screen, then add a second
  // identical set; sliding by exactly one set width loops seamlessly.
  const set = document.createElement('div');
  set.className = 'fresh-set';
  const need = Math.max(1, Math.ceil((window.innerWidth + 200) / (songs.length * 166)));
  for (let r = 0; r < need; r++) songs.forEach((s) => set.appendChild(card(s, r > 0)));
  const copy = set.cloneNode(true);
  copy.setAttribute('aria-hidden', 'true');
  copy.querySelectorAll('a').forEach((a) => { a.tabIndex = -1; a.setAttribute('aria-hidden', 'true'); });
  track.replaceChildren(set, copy);
  track.style.setProperty('--fresh-duration', `${Math.max(20, set.children.length * 4)}s`);
  section.hidden = false;
})();
