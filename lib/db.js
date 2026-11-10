// Postgres for play counts, users and analytics events.
// Production: Neon (DATABASE_URL / POSTGRES_URL set by Vercel's Neon
// integration) over Neon's HTTP driver. Local dev: a plain Postgres via `pg`
// when DATABASE_URL points at localhost. Tables are created on first use.
import { neon } from '@neondatabase/serverless';

const URL_ = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
const isLocal = /@(localhost|127\.0\.0\.1)[:/]|host=\/|^postgres(ql)?:\/\/\/?[^@]*$/.test(URL_);

export const hasDb = () => !!URL_;

let runner = null;
async function getRunner() {
  if (runner) return runner;
  if (isLocal) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: URL_, max: 4 });
    runner = async (text, params) => (await pool.query(text, params)).rows;
  } else {
    const sql = neon(URL_);
    runner = (text, params) => sql.query(text, params);
  }
  return runner;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS plays (
     share_id text PRIMARY KEY,
     count bigint NOT NULL DEFAULT 0,
     updated_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS users (
     id text PRIMARY KEY,
     email text,
     name text,
     image_url text,
     created_at timestamptz NOT NULL DEFAULT now(),
     last_seen timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS events (
     id bigserial PRIMARY KEY,
     type text NOT NULL,
     share_id text,
     user_id text,
     country text,
     device text,
     created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS events_type_time ON events (type, created_at)`,
  `CREATE INDEX IF NOT EXISTS events_time ON events (created_at)`,
];

let ready = null;
export async function query(text, params = []) {
  const run = await getRunner();
  ready ||= (async () => { for (const s of SCHEMA) await run(s, []); })().catch((e) => { ready = null; throw e; });
  await ready;
  return run(text, params);
}
