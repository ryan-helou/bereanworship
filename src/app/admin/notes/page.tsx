import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { listAutoRejected, listNotes, reviewedSongTitles, type NoteView } from '@/lib/notes';
import {
  BUCKET_INFO,
  MAX_NOTE_CHARS,
  MAX_SUBJECT_CHARS,
  NOTE_BUCKETS,
  NOTE_ERRORS,
  isNoteErrorCode,
  type NoteBucketValue,
} from '@/lib/notes-schema';
import { formatDateTime, relativeTime } from '@/lib/utils';
import { Badge } from '@/components/ui';
import { createNoteAction, deleteNoteAction, moveNoteAction, updateNoteAction } from './actions';
import { SubmitButton } from './submit-button';

export const metadata = { title: 'Notes' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const FIELD =
  'w-full rounded-lg border border-line-strong bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300 focus:border-volt-700 focus:outline-none focus:ring-2 focus:ring-volt-700/20';

const SMALL_BUTTON =
  'cursor-pointer rounded-lg px-2.5 py-1.5 text-xs text-ink-500 transition-colors hover:bg-bone-200 hover:text-ink-900 [&::-webkit-details-marker]:hidden list-none';

export default async function AdminNotesPage({ searchParams }: { searchParams: SearchParams }) {
  // Second check. The edge middleware already refused unauthenticated traffic.
  await requireSession('/admin/notes');

  const params = await searchParams;
  const errorRaw = Array.isArray(params.error) ? params.error[0] : params.error;
  const error = isNoteErrorCode(errorRaw) ? NOTE_ERRORS[errorRaw] : null;

  const [notes, titles, autoRejected] = await Promise.all([listNotes(), reviewedSongTitles(), listAutoRejected()]);
  const byBucket = (bucket: NoteBucketValue) => notes.filter((n) => n.bucket === bucket);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Notes</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-500">
          Write a note, then sort it: approved, maybe, or rejected. Notes are private to this signed-in area, and they
          never affect a song&rsquo;s score.
        </p>
      </header>

      {error && (
        <p role="alert" className="border-2 border-flare-600 bg-flare-50 px-4 py-3 text-sm font-medium text-flare-800">
          {error}
        </p>
      )}

      <section aria-labelledby="new-note" className="border-2 border-ink-900 bg-bone-50 p-5">
        <h2 id="new-note" className="text-base font-semibold text-ink-900">
          New note
        </h2>
        <form action={createNoteAction} className="mt-4 space-y-4">
          <div>
            <label htmlFor="note-body" className="mb-1.5 block text-sm font-medium text-ink-700">
              Note
            </label>
            <textarea
              id="note-body"
              name="body"
              rows={4}
              required
              maxLength={MAX_NOTE_CHARS}
              placeholder="What do you think?"
              className={FIELD}
            />
          </div>

          <div>
            <label htmlFor="note-subject" className="mb-1.5 block text-sm font-medium text-ink-700">
              About (optional)
            </label>
            <input
              id="note-subject"
              name="subject"
              type="text"
              list="reviewed-songs"
              maxLength={MAX_SUBJECT_CHARS}
              autoComplete="off"
              placeholder="A song title — reviewed songs are suggested as you type"
              className={FIELD}
            />
            <datalist id="reviewed-songs">
              {titles.map((title) => (
                <option key={title} value={title} />
              ))}
            </datalist>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-ink-700">Bucket</legend>
            <div className="flex flex-wrap gap-2">
              {NOTE_BUCKETS.map((bucket) => (
                <label key={bucket} className="cursor-pointer">
                  <input
                    type="radio"
                    name="bucket"
                    value={bucket}
                    defaultChecked={bucket === 'MAYBE'}
                    className="peer sr-only"
                  />
                  <span className="inline-flex items-center rounded-lg px-4 py-2 text-sm text-ink-600 ring-1 ring-inset ring-line-strong transition-colors hover:bg-bone-200 peer-checked:bg-indigo-900 peer-checked:font-medium peer-checked:text-white peer-checked:ring-indigo-900 peer-focus-visible:ring-2 peer-focus-visible:ring-volt-700">
                    {BUCKET_INFO[bucket].label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <SubmitButton className="inline-flex h-9 items-center rounded-lg bg-volt-700 px-4 text-sm font-medium text-white transition-colors hover:bg-volt-800">Add note</SubmitButton>
        </form>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-3">
        {NOTE_BUCKETS.map((bucket) => (
          <BucketColumn key={bucket} bucket={bucket} notes={byBucket(bucket)} />
        ))}
      </div>

      <section aria-labelledby="auto-rejected" className="border border-line-strong bg-bone-100">
        <header className="border-b border-line-strong bg-bone-50 px-4 py-3">
          <h2 id="auto-rejected" className="flex items-center gap-2 text-base font-semibold text-ink-900">
            Rejected automatically
            <Badge tone="danger" className="tnum">
              {autoRejected.length}
            </Badge>
          </h2>
          <p className="mt-0.5 text-xs text-ink-500">Songs by Hillsong, Elevation or Bethel are always rejected.</p>
        </header>
        <ul className="grid gap-x-6 gap-y-1 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {autoRejected.map((song) => (
            <li key={song.slug}>
              <Link href={`/songs/${song.slug}`} className="text-volt-700 hover:underline">
                {song.displayTitle}
              </Link>
              <span className="text-ink-500"> · {song.artistName}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function BucketColumn({ bucket, notes }: { bucket: NoteBucketValue; notes: NoteView[] }) {
  const info = BUCKET_INFO[bucket];
  const headingId = `bucket-${bucket.toLowerCase()}`;

  return (
    <section aria-labelledby={headingId} className="min-w-0 border border-line-strong bg-bone-100">
      <header className="flex items-center justify-between gap-3 border-b border-line-strong bg-bone-50 px-4 py-3">
        <div className="min-w-0">
          <h2 id={headingId} className="flex items-center gap-2 text-base font-semibold text-ink-900">
            {info.label}
            <Badge tone={info.tone} className="tnum">
              {notes.length}
            </Badge>
          </h2>
          <p className="mt-0.5 text-xs text-ink-500">{info.blurb}</p>
        </div>
      </header>

      <ul className="space-y-3 p-3">
        {notes.length === 0 && (
          <li className="px-2 py-8 text-center text-sm text-ink-400">Nothing here yet.</li>
        )}
        {notes.map((note) => (
          <NoteCard key={note.id} note={note} />
        ))}
      </ul>
    </section>
  );
}

function NoteCard({ note }: { note: NoteView }) {
  const others = NOTE_BUCKETS.filter((b) => b !== note.bucket);
  const heading = note.subject ?? note.song?.displayTitle ?? null;
  // Moving a note counts as a change as well as editing it, so say "updated", not "edited".
  const updated = note.updatedAt.getTime() > note.createdAt.getTime();

  return (
    <li className="border border-line bg-bone-50 p-4">
      {heading && <h3 className="break-words text-sm font-semibold text-ink-900">{heading}</h3>}
      {note.song && (
        <Link href={`/songs/${note.song.slug}`} className="mt-0.5 inline-block text-xs text-volt-700 hover:underline">
          {note.song.displayTitle} · {note.song.artistName}
          {note.song.overallScore !== null && ` · ${note.song.overallScore}/100`} →
        </Link>
      )}

      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-700">{note.body}</p>

      <p className="mt-3 text-xs text-ink-400" title={formatDateTime(note.createdAt)}>
        {relativeTime(note.createdAt)}
        {updated && <span title={formatDateTime(note.updatedAt)}> · updated {relativeTime(note.updatedAt)}</span>}
      </p>

      <div className="mt-3 flex flex-wrap items-start gap-1 border-t border-line pt-3">
        {others.map((bucket) => (
          <form key={bucket} action={moveNoteAction}>
            <input type="hidden" name="id" value={note.id} />
            <input type="hidden" name="bucket" value={bucket} />
            <SubmitButton className="rounded-lg bg-indigo-900 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-800">Move to {BUCKET_INFO[bucket].label}</SubmitButton>
          </form>
        ))}

        <details className="w-full">
          <summary className={SMALL_BUTTON}>Edit</summary>
          <form action={updateNoteAction} className="mt-2 space-y-2">
            <input type="hidden" name="id" value={note.id} />
            <input type="hidden" name="bucket" value={note.bucket} />
            <textarea
              name="body"
              aria-label="Edit note text"
              defaultValue={note.body}
              rows={4}
              required
              maxLength={MAX_NOTE_CHARS}
              className={FIELD}
            />
            <input
              name="subject"
              type="text"
              aria-label="Edit what the note is about"
              defaultValue={note.subject ?? ''}
              list="reviewed-songs"
              maxLength={MAX_SUBJECT_CHARS}
              autoComplete="off"
              placeholder="About (optional)"
              className={FIELD}
            />
            <SubmitButton className="rounded-lg bg-volt-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-volt-800">Save changes</SubmitButton>
          </form>
        </details>

        <details className="w-full">
          <summary className={SMALL_BUTTON}>Delete</summary>
          <form action={deleteNoteAction} className="mt-2 space-y-2">
            <input type="hidden" name="id" value={note.id} />
            <p className="text-xs text-ink-500">Delete this note for good? This cannot be undone.</p>
            <SubmitButton className="rounded-lg bg-flare-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-flare-700">Yes, delete this note</SubmitButton>
          </form>
        </details>
      </div>
    </li>
  );
}
