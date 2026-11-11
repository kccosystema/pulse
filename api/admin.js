// Admin API (one function to stay within Vercel Hobby's function limit).
// /api/admin/<section> is rewritten here as ?section=<section> (vercel.json).
// Every handler checks that the caller is the admin.
import { statsGET } from '../lib/admin-stats.js';
import { songsGET, songsDELETE, jamsPOST, likesPOST, commentPOST } from '../lib/admin-songs.js';
import { usersGET } from '../lib/admin-users.js';
import { json } from '../lib/http.js';

const section = (request) => new URL(request.url).searchParams.get('section');

export function GET(request) {
  switch (section(request)) {
    case 'stats': return statsGET(request);
    case 'songs': return songsGET(request);
    case 'users': return usersGET(request);
    default: return json({ error: 'Not found' }, 404);
  }
}

export function DELETE(request) {
  return section(request) === 'songs' ? songsDELETE(request) : json({ error: 'Not found' }, 404);
}

export function POST(request) {
  switch (section(request)) {
    case 'jams': return jamsPOST(request);
    case 'likes': return likesPOST(request);
    case 'comment': return commentPOST(request);
    default: return json({ error: 'Not found' }, 404);
  }
}
