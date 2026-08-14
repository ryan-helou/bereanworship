'use client';

import { useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { applyReviewAction, purgeCatalogueAction, type ApplyState, type PurgeState } from './actions';

const initialApply: ApplyState = { status: 'idle' };
const initialPurge: PurgeState = { status: 'idle' };

export function ApplyReviewForm() {
  const [state, formAction] = useActionState(applyReviewAction, initialApply);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [chars, setChars] = useState(0);

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    if (textareaRef.current) {
      textareaRef.current.value = text;
      setChars(text.length);
    }
  }

  return (
    <div className="space-y-6">
      <form action={formAction} className="rounded-xl border border-line bg-bone-50 p-5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="payload" className="block text-sm font-medium text-ink-800">
            Review payload (JSON)
          </label>
          <span className="tnum text-xs text-ink-400">{chars.toLocaleString()} characters</span>
        </div>
        <p className="mt-1 text-sm text-ink-500">
          Validated against the same schemas the automated pipeline uses. Scores are computed from the findings — the
          payload has no field for a score.
        </p>

        <textarea
          id="payload"
          name="payload"
          ref={textareaRef}
          required
          rows={18}
          spellCheck={false}
          onChange={(event) => setChars(event.target.value.length)}
          placeholder={'{\n  "kind": "song",\n  "identification": { … },\n  "theological": { "strengths": [ … ], "concerns": [ … ] },\n  …\n}'}
          className="mt-3 w-full rounded-lg border border-line bg-bone-50 p-3.5 font-mono text-[0.8125rem] leading-relaxed text-ink-900 placeholder:text-ink-300 focus:border-volt-400 focus:outline-none focus:ring-4 focus:ring-volt-100"
        />

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <SubmitButton label="Validate and publish" pendingLabel="Publishing…" variant="brand" />
          <label className="cursor-pointer text-sm text-volt-700 underline-offset-4 hover:underline">
            Upload a .json file
            <input type="file" accept=".json,application/json" onChange={onFile} className="sr-only" />
          </label>
        </div>

        {state.status === 'error' && (
          <div role="alert" className="mt-4 rounded-lg border border-flare-200 bg-flare-50 px-4 py-3">
            <p className="text-sm font-medium text-flare-900">{state.message}</p>
            {state.detail && (
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-flare-100/60 p-3 font-mono text-xs leading-relaxed text-flare-900">
                {state.detail}
              </pre>
            )}
          </div>
        )}
      </form>

      {state.status === 'applied' && <AppliedSummary state={state} />}
    </div>
  );
}

function AppliedSummary({ state }: { state: Extract<ApplyState, { status: 'applied' }> }) {
  const r = state.review;
  const href = r.kind === 'song' ? `/songs/${r.slug}` : `/artists/${r.slug}`;

  return (
    <div className="rounded-xl border border-volt-200 bg-volt-50 p-5">
      <h2 className="text-base font-semibold text-volt-900">
        Published — {r.kind === 'song' ? `${r.title} · ${r.artist}` : r.name}
      </h2>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={r.kind === 'song' ? 'Song validity' : 'Artist validity'} value={r.overall} emphasis />
        {r.kind === 'song' ? (
          <>
            <Stat label="Biblical" value={r.theological} />
            <Stat label="Communal" value={r.communal} />
            <Stat label="Clarity" value={r.clarity} />
          </>
        ) : (
          <>
            <Stat label="Doctrine" value={r.doctrine} />
            <Stat label="Teaching" value={r.publicTeaching} />
            <Stat label="Affiliations" value={r.affiliations} />
          </>
        )}
      </dl>

      <p className="mt-4 text-sm text-volt-900">
        <span className="font-medium">{r.recommendation.replace(/_/g, ' ').toLowerCase()}</span> · {r.findingCount}{' '}
        findings · {r.sourceCount} sources · version {r.reviewVersion}
      </p>

      {r.kind === 'song' && (
        <p
          className={cn(
            'mt-2 px-3.5 py-2.5 text-xs leading-relaxed',
            r.evidence.ratio < 0.9 ? 'bg-ochre-100 text-ochre-900' : 'bg-white/70 text-volt-900',
          )}
        >
          {r.evidence.grounded} of {r.evidence.total} findings can be checked — {r.evidence.quoted} quote the song
          ({r.evidence.quotedWords} lyric words), the rest name where they sit.
          {r.evidence.ratio < 0.9 &&
            ' Some findings do neither, so a reader cannot verify them.'}
        </p>
      )}

      {r.kind === 'song' && r.ceiling !== null && (
        <p className="mt-2 rounded-lg bg-ochre-100 px-3.5 py-2.5 text-xs leading-relaxed text-ochre-900">
          A score ceiling of {r.ceiling} was applied: a severe or major theological concern is present, so the weighted
          average alone did not determine the result.
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href={href}
          className="inline-flex h-9 items-center rounded-lg bg-volt-700 px-4 text-sm font-medium text-white transition-colors hover:bg-volt-800"
        >
          View the published review
        </Link>
        <Link
          href="/admin/review"
          className="inline-flex h-9 items-center rounded-lg bg-white px-4 text-sm font-medium text-ink-700 ring-1 ring-inset ring-volt-200 transition-colors hover:bg-bone-50"
        >
          Publish another
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value, emphasis }: { label: string; value: number; emphasis?: boolean }) {
  return (
    <div className="rounded-lg bg-white/70 p-3">
      <dt className="text-xs text-volt-900/70">{label}</dt>
      <dd className={cn('tnum mt-1 font-semibold text-volt-900', emphasis ? 'text-2xl' : 'text-lg')}>{value}</dd>
    </div>
  );
}

export function PurgeForm({ songCount, artistCount }: { songCount: number; artistCount: number }) {
  const [state, formAction] = useActionState(purgeCatalogueAction, initialPurge);
  const [armed, setArmed] = useState(false);

  return (
    <div className="rounded-xl border border-flare-200 bg-flare-50/50 p-5">
      <h2 className="text-base font-semibold text-flare-900">Clear the catalogue</h2>
      <p className="mt-2 text-sm leading-relaxed text-flare-900/90">
        Permanently removes every song, artist, finding, source, job, request and review history entry. The theme
        vocabulary is kept, because the review pipeline depends on it. There is currently{' '}
        <span className="tnum font-semibold">{songCount}</span> {songCount === 1 ? 'song' : 'songs'} and{' '}
        <span className="tnum font-semibold">{artistCount}</span> {artistCount === 1 ? 'artist' : 'artists'}.
      </p>

      {!armed ? (
        <button
          type="button"
          onClick={() => setArmed(true)}
          className="mt-4 inline-flex h-9 items-center rounded-lg bg-white px-4 text-sm font-medium text-flare-700 ring-1 ring-inset ring-flare-300 transition-colors hover:bg-flare-50"
        >
          I want to clear the catalogue
        </button>
      ) : (
        <form action={formAction} className="mt-4 space-y-3">
          <label htmlFor="confirm" className="block text-sm font-medium text-flare-900">
            Type <code className="rounded bg-flare-100 px-1.5 py-0.5 font-mono text-xs">DELETE EVERYTHING</code> to
            confirm
          </label>
          <input
            id="confirm"
            name="confirm"
            autoComplete="off"
            className="h-10 w-full max-w-xs rounded-lg border border-flare-300 bg-white px-3 font-mono text-sm text-ink-900 focus:border-flare-400 focus:outline-none focus:ring-4 focus:ring-flare-100"
          />
          <div className="flex gap-3">
            <SubmitButton label="Clear the catalogue" pendingLabel="Clearing…" variant="danger" />
            <button
              type="button"
              onClick={() => setArmed(false)}
              className="inline-flex h-9 items-center rounded-lg px-3 text-sm text-flare-800 hover:bg-flare-100"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {state.status === 'error' && (
        <p role="alert" className="mt-3 text-sm font-medium text-flare-800">
          {state.message}
        </p>
      )}
      {state.status === 'purged' && (
        <p className="mt-3 rounded-lg bg-white px-3.5 py-2.5 text-sm text-ink-700">{state.message}</p>
      )}
    </div>
  );
}

function SubmitButton({
  label,
  pendingLabel,
  variant,
}: {
  label: string;
  pendingLabel: string;
  variant: 'brand' | 'danger';
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        'inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium text-white transition-colors disabled:opacity-60',
        variant === 'brand' ? 'bg-volt-700 hover:bg-volt-800' : 'bg-flare-600 hover:bg-flare-700',
      )}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
