import { storageMode } from '../lib/storage.js';
import { json } from '../lib/http.js';

export function GET() {
  return json({ storage: storageMode() });
}
