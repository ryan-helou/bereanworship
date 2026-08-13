'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Route-level error boundary.
 *
 * Shows what failed and offers a real way forward. The digest is surfaced
 * because it is the only handle a reader has when reporting a problem — the
 * underlying message is deliberately not exposed in production.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(JSON.stringify({ event: 'page.render_error', digest: error.digest, message: error.message }));
  }, [error]);

  return (
    <div className="container-page flex min-h-[60vh] items-center justify-center py-16">
      <div className="w-full max-w-lg text-center">
        <div className="eyebrow">Something went wrong</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">This page failed to load</h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-500">
          The error has been logged. Trying again often resolves it — if not, the database or the review pipeline may be
          temporarily unavailable.
        </p>

        {error.digest && (
          <p className="mt-4 font-mono text-xs text-ink-400">
            Reference: <span className="text-ink-600">{error.digest}</span>
          </p>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-10 items-center rounded-lg bg-indigo-900 px-4 text-sm font-medium text-white transition-colors hover:bg-indigo-800"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-lg bg-bone-200 px-4 text-sm font-medium text-ink-700 ring-1 ring-inset ring-line transition-colors hover:bg-bone-300"
          >
            Return home
          </Link>
        </div>
      </div>
    </div>
  );
}
