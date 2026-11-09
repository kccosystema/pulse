import { storageMode } from '../lib/storage.js';
import { authMode, CLERK_PUBLISHABLE_KEY, clerkFrontendApi } from '../lib/auth.js';
import { json } from '../lib/http.js';

export function GET() {
  const mode = authMode();
  const auth = mode === 'clerk'
    ? { mode, publishableKey: CLERK_PUBLISHABLE_KEY, frontendApi: clerkFrontendApi() }
    : { mode };
  return json({ storage: storageMode(), auth });
}
