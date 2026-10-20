import { defineConfig, devices } from '@playwright/test';
import { execSync } from 'node:child_process';

/**
 * End-to-end tests.
 *
 * Run against a production build on a dedicated database, seeded with the
 * sample dataset — a dev-server run would hide build-only failures, and using
 * the development database would let a test's song request pollute real data.
 */

try {
  process.loadEnvFile();
} catch {
  // CI supplies the environment directly.
}

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  (process.env.DATABASE_URL
    ? process.env.DATABASE_URL.replace(/\/([^/?]+)(\?|$)/, '/bereanworship_e2e$2')
    : 'postgresql://postgres:postgres@localhost:5432/bereanworship_e2e');

if (/\/bereanworship(\?|$)/.test(E2E_DATABASE_URL)) {
  throw new Error('Refusing to run E2E tests against the development database. Set E2E_DATABASE_URL.');
}

export const ADMIN_STORAGE_STATE = 'test-results/.admin-auth.json';
// A visitor who entered the site password: open to the public pages, never the admin area.
export const SITE_STORAGE_STATE = 'test-results/.site-auth.json';
export const E2E_SITE_PASSWORD = 'e2e-site-password-2026';
// The test server's signing secret, so a test can forge tokens and prove they are refused.
export const E2E_AUTH_SECRET = 'e2e-secret-long-enough-to-satisfy-the-32-char-minimum';
export const E2E_ADMIN_EMAIL = 'e2e-admin@bereanworship.test';
export const E2E_ADMIN_PASSWORD = 'e2e-admin-password-2026';

// Derived once here so the app and the tests agree on the credentials.
const hashOf = (password: string) => {
  const output = execSync(`node scripts/hash-password.mjs '${password}'`).toString();
  const line = output.split('\n').find((l) => l.startsWith('scrypt:'));
  if (!line) {
    // Failing loudly here beats handing the server `undefined` and then
    // debugging "credentials not recognised" through the browser.
    throw new Error(`Could not parse a password hash from hash-password.mjs output:\n${output}`);
  }
  return line.trim();
};
const E2E_ADMIN_PASSWORD_HASH = hashOf(E2E_ADMIN_PASSWORD);
// A separate password for the site gate, so the suite can prove it opens the
// site and nothing else.
const E2E_SITE_PASSWORD_HASH = hashOf(E2E_SITE_PASSWORD);

const PORT = process.env.E2E_PORT ?? '3111';
const BASE_URL = `http://127.0.0.1:${PORT}`;

const serverEnv = {
  ...process.env,
  NODE_ENV: 'production',
  DATABASE_URL: E2E_DATABASE_URL,
  ADMIN_AUTH_SECRET: E2E_AUTH_SECRET,
  ADMIN_EMAIL: E2E_ADMIN_EMAIL,
  ADMIN_PASSWORD_HASH: E2E_ADMIN_PASSWORD_HASH,
  SITE_PASSWORD_HASH: E2E_SITE_PASSWORD_HASH,
  NEXT_PUBLIC_SITE_URL: BASE_URL,
  RUN_INLINE_WORKER: 'false',
  // No API key: the pipeline is exercised by the integration suite, and E2E
  // must never make a paid network call.
  ANTHROPIC_API_KEY: '',
} as Record<string, string>;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Run unauthenticated, because that is precisely what they test: the site
    // gate, and the admin area's own access control.
    {
      name: 'gate',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
      testMatch: /(site-gate|admin-access)\.spec\.ts/,
    },

    // One sign-in each, reused by every test that needs a session. Not just a
    // speed optimisation: both are rate limited, and a suite that signed in for
    // every test would trip its own defences.
    {
      name: 'setup',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /auth\.setup\.ts/,
    },

    // The public site, as a visitor who knows the site password.
    {
      name: 'public',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 }, storageState: SITE_STORAGE_STATE },
      testMatch: /public\.spec\.ts/,
      dependencies: ['setup'],
    },
    {
      name: 'admin',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 }, storageState: ADMIN_STORAGE_STATE },
      testMatch: /admin\.spec\.ts/,
      dependencies: ['setup'],
    },

    {
      name: 'mobile',
      use: { ...devices['iPhone 13'], storageState: SITE_STORAGE_STATE },
      testMatch: /responsive\.spec\.ts/,
      dependencies: ['setup'],
    },
  ],

  webServer: {
    // Preparation happens here, not in globalSetup: Playwright starts
    // webServer *before* globalSetup, so building there would rewrite .next
    // underneath a running server and break asset loading mid-suite.
    command: `node scripts/e2e-prepare.mjs && npx next start -p ${PORT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: serverEnv,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});

export { E2E_DATABASE_URL, BASE_URL };
