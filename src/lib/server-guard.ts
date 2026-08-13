/**
 * Server-only marker.
 *
 * React's `server-only` package cannot be used here: it resolves to a module
 * that throws unless the bundler sets the `react-server` export condition, so
 * importing it would break the standalone worker process (which runs under
 * plain Node, not Next's bundler).
 *
 * This gives the same protection — a loud failure if server code is ever
 * pulled into a client bundle — while remaining importable from the worker,
 * the seed script and the test runner.
 */
if (typeof window !== 'undefined') {
  throw new Error(
    'This module is server-only and must never be imported into client code. ' +
      'It touches the database, secrets, or the AI provider.',
  );
}

export {};
