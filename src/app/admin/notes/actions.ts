'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { audit, getSession } from '@/lib/auth';
import { createNote, deleteNote, moveNote, updateNote } from '@/lib/notes';
import { parseBucket, parseNoteForm, parseNoteId, type NoteErrorCode } from '@/lib/notes-schema';
import { prisma } from '@/lib/db';
import { log } from '@/lib/logger';

/**
 * Private-note mutations.
 *
 * Every action re-verifies the session on the server: the middleware is the
 * first check and this is the second, and neither assumes the other ran.
 *
 * Errors go back to the page as a short code in the URL, never as free text,
 * so nothing a visitor can type is ever reflected into the page. The redirect
 * is issued outside any try/catch because `redirect()` works by throwing.
 */

async function requireAdmin(): Promise<string> {
  const session = await getSession();
  if (!session) redirect('/admin/login?next=%2Fadmin%2Fnotes');
  return session.email;
}

function back(error?: NoteErrorCode): never {
  revalidatePath('/admin/notes');
  redirect(error ? `/admin/notes?error=${error}` : '/admin/notes');
}

export async function createNoteAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const parsed = parseNoteForm(formData);
  if (!parsed.ok) back(parsed.code);

  let failed = false;
  try {
    const id = await createNote(parsed.data);
    // The note body is the owner's private writing: the audit trail records
    // that something happened and where it went, never what was said.
    await audit(actor, 'note.create', id, { bucket: parsed.data.bucket });
  } catch (error) {
    log.error('note.create_failed', { error });
    failed = true;
  }
  back(failed ? 'failed' : undefined);
}

export async function updateNoteAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = parseNoteId(formData.get('id'));
  const parsed = parseNoteForm(formData);
  if (!id) back('missing');
  if (!parsed.ok) back(parsed.code);

  let outcome: 'ok' | 'missing' | 'failed' = 'ok';
  try {
    if (await updateNote(id, parsed.data)) await audit(actor, 'note.edit', id, { bucket: parsed.data.bucket });
    else outcome = 'missing';
  } catch (error) {
    log.error('note.edit_failed', { error });
    outcome = 'failed';
  }
  back(outcome === 'ok' ? undefined : outcome);
}

export async function moveNoteAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = parseNoteId(formData.get('id'));
  const bucket = parseBucket(formData.get('bucket'));
  if (!id) back('missing');
  if (!bucket) back('bucket');

  let outcome: 'ok' | 'missing' | 'failed' = 'ok';
  try {
    const from = await moveNote(id, bucket);
    if (from === null) outcome = 'missing';
    else await audit(actor, 'note.move', id, { from, to: bucket });
  } catch (error) {
    log.error('note.move_failed', { error });
    outcome = 'failed';
  }
  back(outcome === 'ok' ? undefined : outcome);
}

export async function deleteNoteAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = parseNoteId(formData.get('id'));
  if (!id) back('missing');

  let outcome: 'ok' | 'missing' | 'failed' = 'ok';
  try {
    if (await deleteNote(id)) await audit(actor, 'note.delete', id);
    else outcome = 'missing';
  } catch (error) {
    log.error('note.delete_failed', { error });
    outcome = 'failed';
  }
  back(outcome === 'ok' ? undefined : outcome);
}

/**
 * Adds a note from a song's own page and returns there.
 *
 * The song is looked up by id, so the note links to exactly this song even
 * when another song shares its title. The slug only decides where to return,
 * and is re-read from the database rather than trusted from the form.
 */
export async function addSongNoteAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const songId = String(formData.get('songId') ?? '');
  const song = songId
    ? await prisma.song.findUnique({ where: { id: songId }, select: { id: true, slug: true, displayTitle: true } })
    : null;
  if (!song) redirect('/songs');

  const here = `/songs/${song.slug}`;
  const parsed = parseNoteForm(formData);
  if (!parsed.ok) redirect(`${here}?note=${parsed.code}#my-note`);

  let failed = false;
  try {
    const id = await createNote({ ...parsed.data, subject: song.displayTitle }, song.id);
    await audit(actor, 'note.create', id, { bucket: parsed.data.bucket, from: 'song-page' });
  } catch (error) {
    log.error('note.create_failed', { error });
    failed = true;
  }
  revalidatePath('/admin/notes');
  redirect(failed ? `${here}?note=failed#my-note` : `${here}#my-note`);
}
