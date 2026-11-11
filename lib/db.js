// Postgres for play counts, likes, comments, users and analytics events.
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
  `CREATE TABLE IF NOT EXISTS likes (
     share_id text PRIMARY KEY,
     count bigint NOT NULL DEFAULT 0,
     updated_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS like_marks (
     share_id text NOT NULL,
     day date NOT NULL,
     visitor text NOT NULL,
     PRIMARY KEY (share_id, day, visitor))`,
  `CREATE TABLE IF NOT EXISTS like_ips (
     share_id text NOT NULL,
     day date NOT NULL,
     ip text NOT NULL,
     n int NOT NULL DEFAULT 0,
     PRIMARY KEY (share_id, day, ip))`,
  `CREATE TABLE IF NOT EXISTS comments (
     id bigserial PRIMARY KEY,
     share_id text NOT NULL,
     user_id text NOT NULL,
     name text NOT NULL,
     image_url text,
     body text NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS comments_share_time ON comments (share_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS comments_user_time ON comments (user_id, created_at)`,
  // Numbers the admin sets on their own songs live in "seed", apart from the
  // real counts, so analytics can leave them out.
  `ALTER TABLE plays ADD COLUMN IF NOT EXISTS seed bigint NOT NULL DEFAULT 0`,
  `ALTER TABLE likes ADD COLUMN IF NOT EXISTS seed bigint NOT NULL DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS migrations (name text PRIMARY KEY, done_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS artists (
     id bigserial PRIMARY KEY,
     user_id text NOT NULL,
     name text NOT NULL,
     website text,
     links jsonb NOT NULL DEFAULT '{}',
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS artists_user ON artists (user_id)`,
  `CREATE TABLE IF NOT EXISTS reports (
     id bigserial PRIMARY KEY,
     share_id text NOT NULL,
     reason text NOT NULL,
     details text,
     contact text,
     ip_hash text,
     status text NOT NULL DEFAULT 'open',
     created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS reports_status_time ON reports (status, created_at)`,
];

let ready = null;
export async function query(text, params = []) {
  const run = await getRunner();
  ready ||= (async () => { for (const s of SCHEMA) await run(s, []); })().catch((e) => { ready = null; throw e; });
  await ready;
  return run(text, params);
}
