// "Listen on" links for a song: only real pages on the big streaming
// services, so share pages can't be used to send people anywhere else.
export const SERVICES = {
  spotify: { name: 'Spotify', hosts: ['open.spotify.com', 'spotify.link'] },
  apple: { name: 'Apple Music', hosts: ['music.apple.com', 'itunes.apple.com'] },
  youtube: { name: 'YouTube', hosts: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'] },
  soundcloud: { name: 'SoundCloud', hosts: ['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com'] },
};

// One link: the https URL if it's on that service, else ''.
export function cleanLink(service, v) {
  const svc = SERVICES[service];
  if (!svc || typeof v !== 'string') return '';
  const s = v.trim().slice(0, 400);
  if (!s) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s);
    if (!/^https?:$/.test(u.protocol) || !svc.hosts.includes(u.hostname.toLowerCase())) return '';
    u.protocol = 'https:';
    return u.href;
  } catch {
    return '';
  }
}

// { spotify, apple, youtube, soundcloud } with only valid, non-empty entries.
export function cleanLinks(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const k of Object.keys(SERVICES)) {
    const v = cleanLink(k, obj[k]);
    if (v) out[k] = v;
  }
  return out;
}
