'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { submitSongRequest, type RequestState } from './actions';

/**
 * Request form.
 *
 * A plain server action, so it works before hydration and without JavaScript.
 * The four possible outcomes each get their own presentation — in particular,
 * "already reviewed" hands the visitor the review rather than a dead end.
 */

const initialState: RequestState = { status: 'idle' };

export function RequestForm({ defaultTitle = '', defaultArtist = '' }: { defaultTitle?: string; defaultArtist?: string }) {
  const [state, formAction] = useActionState(submitSongRequest, initialState);

  if (state.status === 'already_reviewed') {
    return (
      <div className="rounded-xl border border-volt-200 bg-volt-50 p-6">
        <h2 className="text-lg font-semibold text-volt-900">{state.message}</h2>
        <p className="mt-2 text-[0.9375rem] text-volt-900">
          <span className="font-medium">{state.song.title}</span> by {state.song.artist}
          {state.song.score !== null && (
            <>
              {' '}
              scored <span className="tnum font-semibold">{state.song.score}/100</span>
            </>
          )}
          .
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href={`/songs/${state.song.slug}`}
            className="inline-flex h-10 items-center rounded-lg bg-volt-700 px-4 text-sm font-medium text-white transition-colors hover:bg-volt-800"
          >
            Read the review
          </Link>
          <Link
            href="/request"
            className="inline-flex h-10 items-center rounded-lg bg-white px-4 text-sm font-medium text-ink-700 ring-1 ring-inset ring-volt-200 transition-colors hover:bg-bone-50"
          >
            Request another song
          </Link>
        </div>
      </div>
    );
  }

  if (state.status === 'received' || state.status === 'already_requested') {
    const alreadyRequested = state.status === 'already_requested';

    return (
      <div className="rounded-xl border border-line bg-bone-50 p-6">
        <div className="flex items-start gap-3">
          <svg
            viewBox="0 0 20 20"
            className={cn('mt-0.5 size-5 shrink-0', alreadyRequested ? 'text-ink-400' : 'text-volt-600')}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            aria-hidden="true"
          >
            <circle cx="10" cy="10" r="7.5" />
            <path d="m6.75 10.25 2.25 2.25 4.25-4.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <h2 className="text-lg font-semibold text-ink-900">
              {alreadyRequested ? 'Already on the list' : 'Request received'}
            </h2>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-600">{state.message}</p>
            {alreadyRequested && state.requestCount > 1 && (
              <p className="mt-2 text-sm text-ink-500 tnum">
                {state.requestCount} people have now asked for this song.
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/request"
            className="inline-flex h-10 items-center rounded-lg bg-indigo-900 px-4 text-sm font-medium text-white transition-colors hover:bg-indigo-800"
          >
            Request another song
          </Link>
          <Link
            href="/songs"
            className="inline-flex h-10 items-center rounded-lg bg-bone-50 px-4 text-sm font-medium text-ink-700 ring-1 ring-inset ring-line transition-colors hover:bg-bone-200"
          >
            Browse reviewed songs
          </Link>
        </div>
      </div>
    );
  }

  const fieldErrors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} className="space-y-6">
      {state.status === 'error' && !state.fieldErrors && (
        <div role="alert" className="rounded-lg border border-flare-200 bg-flare-50 px-4 py-3 text-sm text-flare-800">
          {state.message}
        </div>
      )}

      <Field
        name="title"
        label="Song title"
        required
        defaultValue={defaultTitle}
        placeholder="e.g. In Christ Alone"
        error={fieldErrors.title}
        autoComplete="off"
      />

      <Field
        name="artist"
        label="Artist"
        defaultValue={defaultArtist}
        placeholder="e.g. Keith &amp; Kristyn Getty"
        hint="Optional, but it helps a great deal — several different songs often share a title."
        error={fieldErrors.artist}
        autoComplete="off"
      />

      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-ink-800">
          Notes <span className="font-normal text-ink-400">(optional)</span>
        </label>
        <p className="mt-1 text-sm text-ink-500">
          Anything that would help — which recording you mean, a specific line you have questions about.
        </p>
        <textarea
          id="notes"
          name="notes"
          rows={4}
          maxLength={1000}
          className="mt-2 w-full rounded-xl border border-line bg-bone-50 px-3.5 py-3 text-[0.9375rem] text-ink-900 placeholder:text-ink-300 focus:border-volt-400 focus:outline-none focus:ring-4 focus:ring-volt-100"
          placeholder="Optional context…"
        />
        {fieldErrors.notes && <p className="mt-1.5 text-sm text-flare-700">{fieldErrors.notes}</p>}
      </div>

      {/* Honeypot — hidden from people, irresistible to bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Leave this field empty</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <SubmitButton />

      <p className="text-xs leading-relaxed text-ink-400">
        No account is needed and no personal information is stored. Requests are queued for review and published once
        complete.
      </p>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 items-center justify-center rounded-lg bg-volt-700 px-5 text-sm font-medium text-white transition-colors hover:bg-volt-800 disabled:opacity-60"
    >
      {pending ? (
        <>
          <svg className="mr-2 size-4 animate-spin" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
            <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Submitting…
        </>
      ) : (
        'Request review'
      )}
    </button>
  );
}

function Field({
  name,
  label,
  required,
  defaultValue,
  placeholder,
  hint,
  error,
  autoComplete,
}: {
  name: string;
  label: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-ink-800">
        {label}
        {!required && <span className="ml-1 font-normal text-ink-400">(optional)</span>}
      </label>
      {hint && <p className="mt-1 text-sm text-ink-500">{hint}</p>}
      <input
        id={name}
        name={name}
        type="text"
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${name}-error` : undefined}
        className={cn(
          'mt-2 h-11 w-full rounded-xl border bg-bone-50 px-3.5 text-[0.9375rem] text-ink-900',
          'placeholder:text-ink-300 focus:outline-none focus:ring-4',
          error
            ? 'border-flare-300 focus:border-flare-400 focus:ring-flare-100'
            : 'border-line focus:border-volt-400 focus:ring-volt-100',
        )}
      />
      {error && (
        <p id={`${name}-error`} className="mt-1.5 text-sm text-flare-700">
          {error}
        </p>
      )}
    </div>
  );
}
