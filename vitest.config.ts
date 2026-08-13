import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * Two test projects with different costs:
 *
 *   unit        — pure functions (scoring, normalization). No database, runs
 *                 in milliseconds, so it can run on every save.
 *   integration — real Postgres against a dedicated test database. Slower, and
 *                 deliberately serial: the tests truncate shared tables.
 *
 * The AI provider is never called by either. Integration tests inject a
 * deterministic fake, so the whole pipeline is exercised without a network
 * call or a token spent.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(root, 'src') },
  },
  test: {
    projects: [
      {
        resolve: { alias: { '@': path.resolve(root, 'src') } },
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        resolve: { alias: { '@': path.resolve(root, 'src') } },
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['tests/integration/setup.ts'],
          // All integration files share one database and TRUNCATE between
          // tests, so they must run strictly one at a time. A single fork is
          // what actually guarantees that: without it Vitest gives each file
          // its own worker, and two workers will happily wipe each other's
          // rows mid-test — which is exactly what happened before this line.
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
          sequence: { concurrent: false },
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
