import Link from 'next/link';
import { env } from '@/lib/env';
import { hasSiteAccess } from '@/lib/site-access';
import { notesForSong } from '@/lib/notes';
import { BUCKET_INFO, MAX_NOTE_CHARS, NOTE_BUCKETS, NOTE_ERRORS, type NoteErrorCode } from '@/lib/notes-schema';
import { addSongNoteAction } from '@/app/admin/notes/actions';
import { SubmitButton } from '@/app/admin/notes/submit-button';
import { formatDate } from '@/lib/utils';

/**
 * A private verdict on this song: Approved, Maybe or Rejected, plus a
 * note. Rendered only for visitors who have passed the site password.
 */
export async function SongNotePanel({ songId, error }: { songId: string; error?: string }) {
  // Anyone who got past the site password may write notes; with the gate off
  // the site is public, so there is nobody to write them and the box stays hidden.
  if (!env.siteGateEnabled || !(await hasSiteAccess())) return null;

  const notes = await notesForSong(songId);
  const message = error && error in NOTE_ERRORS ? NOTE_ERRORS[error as NoteErrorCode] : null;

  return (
    <section id="my-note" className="band-bone border-b-2 border-ink-900">
      <div className="container-page py-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="eyebrow">My note (private)</h2>
          <Link href="/admin/notes" className="text-sm text-ink-600 underline">
            All notes
          </Link>
        </div>

        {notes.length > 0 && (
          <ul className="mt-4 space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="border border-line-strong bg-bone-50 px-4 py-3 text-sm">
                <span className="font-medium">{BUCKET_INFO[n.bucket].label}</span>
                <span className="text-ink-600"> · {formatDate(n.createdAt)}</span>
                <p className="mt-1 whitespace-pre-wrap">{n.body}</p>
              </li>
            ))}
          </ul>
        )}

        <form action={addSongNoteAction} className="mt-4 space-y-3">
          <input type="hidden" name="songId" value={songId} />
          {message && (
            <p role="alert" className="text-sm text-red-700">
              {message}
            </p>
          )}
          <fieldset>
            <legend className="sr-only">Verdict</legend>
            <div className="flex flex-wrap gap-2">
              {NOTE_BUCKETS.map((bucket) => (
                <label key={bucket} className="cursor-pointer">
                  <input type="radio" name="bucket" value={bucket} defaultChecked={bucket === 'MAYBE'} className="peer sr-only" />
                  <span className="inline-flex items-center rounded-lg px-4 py-2 text-sm text-ink-600 ring-1 ring-inset ring-line-strong transition-colors hover:bg-bone-200 peer-checked:bg-indigo-900 peer-checked:font-medium peer-checked:text-white peer-checked:ring-indigo-900 peer-focus-visible:ring-2 peer-focus-visible:ring-volt-700">
                    {BUCKET_INFO[bucket].label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <textarea
            name="body"
            aria-label="Note"
            rows={3}
            required
            maxLength={MAX_NOTE_CHARS}
            placeholder="What do you think of this song?"
            className="w-full border border-line-strong bg-white px-3 py-2 text-sm"
          />
          <SubmitButton className="inline-flex h-9 items-center rounded-lg bg-volt-700 px-4 text-sm font-medium text-white transition-colors hover:bg-volt-800">
            Save note
          </SubmitButton>
        </form>
      </div>
    </section>
  );
}
