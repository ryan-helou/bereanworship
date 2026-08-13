import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { SONG_WEIGHTS } from '@/lib/scoring';
import { ApplyReviewForm, PurgeForm } from './review-form';

export const metadata = { title: 'Publish a review' };

/**
 * Manual review publishing.
 *
 * The worker is one way to produce a review; a researcher is another. This page
 * accepts findings produced by hand and puts them through exactly the same
 * validation, scoring and persistence as an automated review, so a manually
 * researched song is indistinguishable from a pipeline one in the database —
 * as it should be, since only the researcher differs.
 */
export default async function AdminReviewPage() {
  await requireSession('/admin/review');

  const [songCount, artistCount] = await Promise.all([prisma.song.count(), prisma.artist.count()]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Publish a review</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-500">
          Paste findings produced by a researcher. They are validated against the same schemas the automated pipeline
          uses, scored by the same deterministic engine, and saved through the same versioned path.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <ApplyReviewForm />

        <aside className="space-y-4">
          <div className="rounded-xl border border-line bg-bone-50 p-5">
            <h2 className="text-sm font-semibold text-ink-900">You cannot supply a score</h2>
            <p className="mt-2 text-xs leading-relaxed text-ink-500">
              There is no field for one. You supply findings — each with a severity, how central the affected doctrine
              is, and whether it recurs — and the engine computes{' '}
              {SONG_WEIGHTS.THEOLOGICAL * 100}/{SONG_WEIGHTS.COMMUNAL * 100}/{SONG_WEIGHTS.CLARITY * 100} exactly as it
              does for the worker.
            </p>
          </div>

          <div className="rounded-xl border border-line bg-bone-50 p-5">
            <h2 className="text-sm font-semibold text-ink-900">Payload shape</h2>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-bone-200 p-3 font-mono text-[0.6875rem] leading-relaxed text-ink-700">
              {`{
  "kind": "song",
  "identification": { … },
  "claims": { … },
  "theological": {
    "assessment": "…",
    "strengths": [ … ],
    "concerns":  [ … ]
  },
  "communal":  { … },
  "clarity":   { … },
  "synthesis": { … },
  "sources": ["https://…"]
}`}
            </pre>
            <p className="mt-3 text-xs leading-relaxed text-ink-500">
              Use <code className="font-mono">&quot;kind&quot;: &quot;artist&quot;</code> with an{' '}
              <code className="font-mono">artist</code> name and a <code className="font-mono">research</code> object to
              publish artist research instead.
            </p>
          </div>

          <div className="rounded-xl border border-line bg-bone-50 p-5">
            <h2 className="text-sm font-semibold text-ink-900">Guardrails still apply</h2>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-ink-500">
              <li>· Lyric excerpts are truncated to ten words.</li>
              <li>· Themes outside the vocabulary are dropped.</li>
              <li>· A severe theological concern imposes its ceiling.</li>
              <li>· Re-publishing archives the previous version rather than overwriting it.</li>
            </ul>
          </div>
        </aside>
      </div>

      <section className="border-t border-line pt-6">
        <PurgeForm songCount={songCount} artistCount={artistCount} />
      </section>
    </div>
  );
}
