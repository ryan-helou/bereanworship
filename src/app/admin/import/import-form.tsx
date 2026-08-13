'use client';

import { useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { runImport, type ImportState } from '../actions';
import type { RowOutcome } from '@/lib/import';

const initialState: ImportState = { status: 'idle' };

const OUTCOME_LABEL: Record<RowOutcome, string> = {
  queued: 'Queued',
  already_reviewed: 'Already reviewed',
  already_queued: 'Already queued',
  duplicate_in_submission: 'Duplicate in paste',
  invalid: 'Could not read',
};

const OUTCOME_STYLE: Record<RowOutcome, string> = {
  queued: 'bg-brand-50 text-brand-800 ring-brand-200',
  already_reviewed: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  already_queued: 'bg-surface-100 text-ink-600 ring-line',
  duplicate_in_submission: 'bg-surface-100 text-ink-500 ring-line',
  invalid: 'bg-red-50 text-red-800 ring-red-200',
};

export function ImportForm() {
  const [state, formAction] = useActionState(runImport, initialState);
  const [lineCount, setLineCount] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /** Reads an uploaded CSV/TXT into the textarea so one code path handles both. */
  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    if (textareaRef.current) {
      textareaRef.current.value = text;
      setLineCount(countLines(text));
    }
  }

  return (
    <div className="space-y-6">
      <form action={formAction} className="rounded-xl border border-line bg-surface-0 p-5">
        <div>
          <label htmlFor="label" className="block text-sm font-medium text-ink-800">
            Batch label <span className="font-normal text-ink-400">(optional)</span>
          </label>
          <input
            id="label"
            name="label"
            type="text"
            placeholder="e.g. CCLI Top 100 — 2026"
            className="mt-2 h-10 w-full max-w-sm rounded-lg border border-line bg-surface-0 px-3 text-sm text-ink-900 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
          />
        </div>

        <div className="mt-5">
          <div className="flex items-baseline justify-between">
            <label htmlFor="text" className="block text-sm font-medium text-ink-800">
              Song list
            </label>
            <span className="tnum text-xs text-ink-400">{lineCount} lines</span>
          </div>
          <textarea
            id="text"
            name="text"
            ref={textareaRef}
            required
            rows={16}
            onChange={(event) => setLineCount(countLines(event.target.value))}
            spellCheck={false}
            placeholder={'Amazing Grace — John Newton\nHoly, Holy, Holy — Reginald Heber\nIn Christ Alone — Keith Getty'}
            className="mt-2 w-full rounded-lg border border-line bg-surface-0 p-3.5 font-mono text-[0.8125rem] leading-relaxed text-ink-900 placeholder:text-ink-300 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <SubmitButton />

          <label className="cursor-pointer text-sm text-brand-700 underline-offset-4 hover:underline">
            Upload a CSV or text file
            <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={onFile} className="sr-only" />
          </label>
        </div>

        {state.status === 'error' && (
          <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {state.message}
          </div>
        )}
      </form>

      {state.status === 'done' && <ImportReport state={state} />}
    </div>
  );
}

function ImportReport({ state: { result, summary } }: { state: Extract<ImportState, { status: 'done' }> }) {
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? result.rows : result.rows.slice(0, 25);

  return (
    <div className="rounded-xl border border-line bg-surface-0 p-5">
      <h2 className="text-base font-semibold text-ink-900">Import complete</h2>
      <p className="mt-1 text-sm text-ink-500">{summary}</p>

      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Submitted" value={result.submitted} />
        <Stat label="Queued" value={result.queued} tone="brand" />
        <Stat label="Already reviewed" value={result.alreadyReviewed} />
        <Stat label="Duplicates" value={result.duplicatesInSubmission} />
        <Stat label="Could not read" value={result.invalid} tone={result.invalid > 0 ? 'danger' : 'neutral'} />
      </dl>

      {(result.artistsCreated > 0 || result.artistResearchQueued > 0) && (
        <p className="mt-4 rounded-lg bg-surface-50 px-4 py-3 text-sm text-ink-600">
          {result.artistsCreated} new {result.artistsCreated === 1 ? 'artist' : 'artists'} created ·{' '}
          {result.artistResearchQueued} queued for research. Artists already researched were reused rather than
          re-queued.
        </p>
      )}

      {result.warnings.map((warning) => (
        <p key={warning} className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {warning}
        </p>
      ))}

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href={`/admin/jobs?batch=${result.batchId}`}
          className="inline-flex h-9 items-center rounded-lg bg-ink-900 px-4 text-sm font-medium text-white transition-colors hover:bg-ink-800"
        >
          Track this batch
        </Link>
        <Link
          href="/admin/jobs"
          className="inline-flex h-9 items-center rounded-lg bg-surface-100 px-4 text-sm font-medium text-ink-700 ring-1 ring-inset ring-line transition-colors hover:bg-surface-200"
        >
          View the whole queue
        </Link>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-ink-900">Per-line results</h3>
        <div className="mt-3 max-h-96 overflow-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 border-b border-line bg-surface-50">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium text-ink-500">
                  Line
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-ink-500">
                  Song
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-ink-500">
                  Artist
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-ink-500">
                  Outcome
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={`${row.line}-${row.raw}`}>
                  <td className="px-3 py-2 tnum text-ink-400">{row.line}</td>
                  <td className="px-3 py-2 text-ink-800">
                    {row.songSlug ? (
                      <Link href={`/songs/${row.songSlug}`} className="text-brand-700 hover:underline">
                        {row.title}
                      </Link>
                    ) : (
                      row.title
                    )}
                  </td>
                  <td className="px-3 py-2 text-ink-500">{row.artist ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
                        OUTCOME_STYLE[row.outcome],
                      )}
                    >
                      {OUTCOME_LABEL[row.outcome]}
                    </span>
                    {row.detail && <div className="mt-0.5 text-xs text-ink-400">{row.detail}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!showAll && result.rows.length > 25 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="mt-3 text-sm text-brand-700 underline-offset-4 hover:underline"
          >
            Show all {result.rows.length} rows
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'brand' | 'danger' }) {
  const toneClass = { neutral: 'text-ink-900', brand: 'text-brand-700', danger: 'text-red-700' }[tone];
  return (
    <div className="rounded-lg bg-surface-50 p-3">
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className={cn('tnum mt-1 text-2xl font-semibold', toneClass)}>{value}</dd>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center rounded-lg bg-brand-700 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-800 disabled:opacity-60"
    >
      {pending ? 'Processing…' : 'Parse and queue'}
    </button>
  );
}

function countLines(text: string): number {
  return text.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith('#')).length;
}
