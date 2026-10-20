import Link from 'next/link';
import { env } from '@/lib/env';
import { hasSiteAccess } from '@/lib/site-access';
import { notesForSong } from '@/lib/notes';
import { BUCKET_INFO, MAX_NOTE_CHARS, NOTE_BUCKETS, NOTE_ERRORS, type NoteErrorCode } from '@/lib/notes-schema';
import { addSongNoteAction } from '@/app/admin/notes/actions';
import { SubmitButton } from '@/app/admin/notes/submit-button';
import { formatDate } from '@/lib/utils';

const PILL = { APPROVED: 'bg-emerald-700', MAYBE: 'bg-amber-600', REJECTED: 'bg-red-700' } as const;
const CHECKED = {
  APPROVED: 'peer-checked:bg-emerald-700',
  MAYBE: 'peer-checked:bg-amber-600',
  REJECTED: 'peer-checked:bg-red-700',
} as const;

/**
 * A private verdict on this song: Approved, Maybe or Rejected, plus a
 * note. Rendered only for visitors who have passed the site password.
 */
export async function SongNotePanel({
  songId,
  error,
  rejectedBy,
}: {
  songId: string;
  error?: string;
  rejectedBy: string | null;
}) {
  // Anyone who got past the site password may write notes; with the gate off
  // the site is public, so there is nobody to write them and the box stays hidden.
  if (!env.siteGateEnabled || !(await hasSiteAccess())) return null;

  const notes = await notesForSong(songId);
  const message = error && error in NOTE_ERRORS ? NOTE_ERRORS[error as NoteErrorCode] : null;

  return (
    <section id="my-note" className="band-bone border-b-2 border-ink-900">
      <div className="container-page py-10">
        <div className="max-w-2xl rounded-xl border border-line-strong bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-tight text-ink-900">What do you think of this song?</h2>
            <Link href="/admin/notes" className="shrink-0 text-sm text-ink-500 underline-offset-2 hover:underline">
              All notes
            </Link>
          </div>
          <p className="mt-1 text-sm text-ink-500">Only people with the site password can see notes.</p>
          {rejectedBy && (
            <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
              Rejected automatically: songs by {rejectedBy} are always rejected.
            </p>
          )}

          {notes.length > 0 && (
            <ul className="mt-6 space-y-3">
              {notes.map((n) => (
                <li key={n.id} className="rounded-lg bg-bone-100 px-4 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold text-white ${PILL[n.bucket]}`}>
                      {BUCKET_INFO[n.bucket].label}
                    </span>
                    <span className="text-ink-500">{formatDate(n.createdAt)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-ink-800">{n.body}</p>
                </li>
              ))}
            </ul>
          )}

          <form action={addSongNoteAction} className="mt-6 space-y-4">
            <input type="hidden" name="songId" value={songId} />
            {message && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {message}
              </p>
            )}
            <fieldset>
              <legend className="sr-only">Verdict</legend>
              <div className="grid grid-cols-3 gap-2">
                {NOTE_BUCKETS.map((bucket) => (
                  <label key={bucket} className="cursor-pointer">
                    <input type="radio" name="bucket" value={bucket} defaultChecked={bucket === (rejectedBy ? 'REJECTED' : 'MAYBE')} className="peer sr-only" />
                    <span
                      className={`flex h-11 items-center justify-center rounded-lg text-sm font-medium text-ink-700 ring-1 ring-inset ring-line-strong transition-colors hover:bg-bone-100 peer-checked:text-white peer-checked:ring-0 peer-focus-visible:ring-2 peer-focus-visible:ring-volt-700 ${CHECKED[bucket]}`}
                    >
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
              placeholder="Add a note…"
              className="w-full resize-y rounded-lg border border-line-strong bg-white px-4 py-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-volt-700 focus:outline-none focus:ring-2 focus:ring-volt-700/30"
            />
            <SubmitButton className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-ink-900 px-6 text-sm font-semibold text-white transition-colors hover:bg-ink-800 sm:w-auto">
              Save note
            </SubmitButton>
          </form>
        </div>
      </div>
    </section>
  );
}
