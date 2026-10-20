import { beforeAll, beforeEach, afterAll } from 'vitest';
import { execSync } from 'node:child_process';

/**
 * Integration test harness.
 *
 * Runs against a real Postgres instance — the search layer is raw SQL with
 * tsvector and pg_trgm, so an in-memory or mocked database would test nothing
 * that matters.
 *
 * A dedicated database (bereanworship_test) is used so a test run can never
 * touch development data.
 */

// Vitest does not read .env, so load it here before deriving the test URL —
// otherwise we would fall back to credentials that may not exist locally.
try {
  process.loadEnvFile();
} catch {
  // No .env (CI); rely on the real environment.
}

/**
 * Derived from DATABASE_URL by swapping the database name, so the test
 * database always uses the same host, port and credentials as development.
 * Override wholesale with TEST_DATABASE_URL when that is not wanted.
 */
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  (process.env.DATABASE_URL
    ? process.env.DATABASE_URL.replace(/\/([^/?]+)(\?|$)/, '/bereanworship_test$2')
    : 'postgresql://postgres:postgres@localhost:5432/bereanworship_test');

if (/\/bereanworship(\?|$)/.test(TEST_DATABASE_URL)) {
  // A misconfigured derivation would truncate the development database.
  throw new Error(
    'Refusing to run integration tests against the development database. ' +
      'Set TEST_DATABASE_URL to a dedicated test database.',
  );
}

process.env.DATABASE_URL = TEST_DATABASE_URL;
// NODE_ENV is typed readonly; assigning through the record is the sanctioned way.
(process.env as Record<string, string>).NODE_ENV = 'test';
process.env.ADMIN_AUTH_SECRET ??= 'test-secret-that-is-definitely-long-enough-1234567890';
process.env.ADMIN_EMAIL ??= 'admin@test.local';
// Tests never call a real provider; the fake is injected per test.
delete process.env.ANTHROPIC_API_KEY;

// Tables truncated between tests, children before parents.
const TABLES = [
  'review_history',
  'song_findings',
  'song_scriptures',
  'song_themes',
  'song_sources',
  'artist_findings',
  'artist_sources',
  'review_jobs',
  'song_requests',
  'notes',
  'import_batches',
  'sources',
  'songs',
  'artists',
  'rate_limit_buckets',
  'admin_audit_log',
];

beforeAll(async () => {
  // Bring the test database up to the current schema. `migrate deploy` is
  // idempotent, so this is cheap on subsequent runs.
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });
  execSync('node scripts/ensure-search-indexes.mjs', {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });
  execSync('node scripts/seed-themes.mjs', {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });
});

beforeEach(async () => {
  const { prisma } = await import('@/lib/db');
  // TRUNCATE ... CASCADE in one statement: far faster than per-table deletes
  // and immune to foreign-key ordering mistakes.
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  const { prisma } = await import('@/lib/db');
  await prisma.$disconnect();
});
