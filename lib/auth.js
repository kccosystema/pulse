// Who is calling? Verifies the Clerk session token sent as
// "Authorization: Bearer <token>" using Clerk's public signing keys (JWKS),
// so no Clerk secret key is needed on the server.
//
// Local dev (scripts/dev.mjs sets PULSE_DEV_AUTH=1) accepts "Bearer dev:<id>".
import { createRemoteJWKSet, jwtVerify } from 'jose';

// Clerk's publishable key is public (it ships to every browser), so it can
// live here or in the CLERK_PUBLISHABLE_KEY environment variable.
const DEFAULT_PUBLISHABLE_KEY = 'pk_test_c3dlZXQtbGFyay0xMzAzLmNsZXJrLmFjY291bnRzLmRldiQ';
export const CLERK_PUBLISHABLE_KEY = process.env.CLERK_PUBLISHABLE_KEY || DEFAULT_PUBLISHABLE_KEY;

// pk_test_<base64("my-app-12.clerk.accounts.dev$")> → "my-app-12.clerk.accounts.dev"
export function clerkFrontendApi(pk = CLERK_PUBLISHABLE_KEY) {
  const m = /^pk_(test|live)_(.+)$/.exec(pk || '');
  if (!m) return null;
  try {
    const host = Buffer.from(m[2], 'base64').toString('utf8').replace(/\$$/, '');
    return /^[a-z0-9.-]+$/i.test(host) ? host : null;
  } catch {
    return null;
  }
}

export function authMode() {
  if (process.env.PULSE_DEV_AUTH === '1') return 'dev';
  return clerkFrontendApi() ? 'clerk' : 'none';
}

let jwks = null;

// Admins are identified by their verified sign-in email (Clerk session-token
// claim "email"). Override with ADMIN_EMAILS="a@x.com,b@y.com".
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'bobby@rawritup.com')
  .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

export const isAdmin = (user) => !!(user && user.email && ADMIN_EMAILS.includes(user.email.toLowerCase()));

// Returns { userId, email, name, imageUrl } or null. Never throws for a bad/missing token.
// email/name/imageUrl come from custom session-token claims (Clerk dashboard →
// Sessions → Customize session token) and are null if those aren't set up.
export async function getUser(request) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const mode = authMode();
  if (mode === 'dev') {
    const m = /^dev:([\w.-]{1,64})$/.exec(token);
    return m ? { userId: `dev_${m[1]}`, email: `${m[1]}@dev.local`, name: m[1], imageUrl: null } : null;
  }
  if (mode !== 'clerk') return null;
  const issuer = `https://${clerkFrontendApi()}`;
  jwks ||= createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, algorithms: ['RS256'], clockTolerance: 10 });
    // azp = the site the token was issued to; must be this site.
    if (payload.azp) {
      const origin = request.headers.get('origin') || new URL(request.url).origin;
      const host = (u) => { try { return new URL(u).host; } catch { return ''; } };
      const allowed = new Set([host(origin), request.headers.get('x-forwarded-host'), new URL(request.url).host].filter(Boolean));
      if (!allowed.has(host(payload.azp))) return null;
    }
    if (typeof payload.sub !== 'string') return null;
    const str = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null);
    return { userId: payload.sub, email: str(payload.email), name: str(payload.name), imageUrl: str(payload.image_url) };
  } catch {
    return null;
  }
}
