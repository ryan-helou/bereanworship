#!/usr/bin/env node
/**
 * Prepares everything the E2E run needs, then exits so `next start` can boot.
 *
 * This deliberately runs as part of the webServer command rather than from
 * Playwright's globalSetup. Playwright starts webServer *before* globalSetup,
 * so building there rewrites `.next` underneath an already-running server:
 * chunk hashes change, the browser requests assets that no longer exist, and
 * the symptoms are baffling — unstyled pages, "a client-side exception has
 * occurred", and failures scattered across unrelated tests.
 *
 * Doing the work here guarantees the database and the build are both final
 * before a single request is served.
 *
 * Reads DATABASE_URL from the environment (set by playwright.config.ts).
 */
import { execSync } from 'node:child_process';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[e2e] DATABASE_URL is required.');
  process.exit(1);
}

if (/\/bereanworship(\?|$)/.test(DATABASE_URL)) {
  console.error('[e2e] Refusing to prepare against the development database.');
  process.exit(1);
}

const dbName = DATABASE_URL.match(/\/([^/?]+)(\?|$)/)?.[1] ?? 'bereanworship_e2e';
const env = { ...process.env };
const run = (cmd, opts = {}) => execSync(cmd, { env, stdio: 'inherit', ...opts });

console.log(`[e2e] preparing database "${dbName}"…`);
try {
  execSync(`createdb ${dbName}`, { stdio: 'ignore' });
} catch {
  // Already exists.
}

run('npx prisma migrate deploy');
run('node scripts/ensure-search-indexes.mjs');

// Start from an empty catalogue every run, so results depend on behaviour
// rather than on what a previous run happened to leave behind.
console.log('[e2e] resetting data…');
execSync('npx prisma db execute --stdin --schema prisma/schema.prisma', {
  env,
  input: `TRUNCATE TABLE
    "review_history", "song_findings", "song_scriptures", "song_themes", "song_sources",
    "artist_findings", "artist_sources", "review_jobs", "song_requests", "import_batches",
    "sources", "songs", "artists", "notes", "rate_limit_buckets", "admin_audit_log"
    RESTART IDENTITY CASCADE;`,
  stdio: ['pipe', 'ignore', 'inherit'],
});

console.log('[e2e] seeding sample data…');
run('npx tsx prisma/seed.ts --sample');

console.log('[e2e] building…');
run('npx prisma generate && npx next build', { env: { ...env, NODE_ENV: 'production' } });

console.log('[e2e] ready.');
