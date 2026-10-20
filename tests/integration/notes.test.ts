import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { findOrCreateArtist, findOrCreateSong } from '@/lib/reviews';
import { createNote, deleteNote, listNotes, moveNote, reviewedSongTitles, updateNote } from '@/lib/notes';

/**
 * Private notes against a real database. The behaviour that matters most is
 * the linking rule: a note about a song links to it only when that is
 * unambiguous, because a wrong link is worse than none.
 */

async function song(title: string, artist: string, status: 'COMPLETED' | 'QUEUED' = 'COMPLETED') {
  const a = await findOrCreateArtist(artist);
  const s = await findOrCreateSong({ title, artistId: a.id, artistName: a.displayName });
  await prisma.song.update({ where: { id: s.id }, data: { reviewStatus: status, overallScore: status === 'COMPLETED' ? 82 : null } });
  return s;
}

const note = (over: Partial<{ body: string; bucket: 'APPROVED' | 'MAYBE' | 'REJECTED'; subject: string | null }> = {}) => ({
  body: 'A note.',
  bucket: 'MAYBE' as const,
  subject: null,
  ...over,
});

describe('notes: creating and listing', () => {
  it('stores a note in the bucket it was written into', async () => {
    await createNote(note({ body: 'Keep this.', bucket: 'APPROVED' }));
    const [n] = await listNotes();
    expect(n.body).toBe('Keep this.');
    expect(n.bucket).toBe('APPROVED');
    expect(n.song).toBeNull();
  });

  it('marks a note as updated only once it has actually changed', async () => {
    const id = await createNote(note({ body: 'Untouched.' }));
    const [fresh] = await listNotes();
    expect(fresh.updatedAt.getTime()).toBe(fresh.createdAt.getTime());

    await moveNote(id, 'APPROVED');
    const [moved] = await listNotes();
    expect(moved.updatedAt.getTime()).toBeGreaterThan(moved.createdAt.getTime());
  });

  it('lists newest first', async () => {
    await createNote(note({ body: 'first' }));
    await new Promise((r) => setTimeout(r, 15));
    await createNote(note({ body: 'second' }));
    expect((await listNotes()).map((n) => n.body)).toEqual(['second', 'first']);
  });

  it('links a note to a reviewed song, ignoring case and punctuation', async () => {
    const s = await song('Graves Into Gardens', 'Elevation Worship');
    await createNote(note({ subject: '  graves into gardens! ' }));
    const [n] = await listNotes();
    expect(n.song?.id).toBe(s.id);
    expect(n.song?.overallScore).toBe(82);
  });

  it('does not link when two songs share the title', async () => {
    await song('Forever', 'Kari Jobe');
    await song('Forever', 'Chris Tomlin');
    await createNote(note({ subject: 'Forever' }));
    const [n] = await listNotes();
    expect(n.subject).toBe('Forever');
    expect(n.song).toBeNull();
  });

  it('does not link a song that has not been reviewed', async () => {
    await song('Living Hope', 'Phil Wickham', 'QUEUED');
    await createNote(note({ subject: 'Living Hope' }));
    expect((await listNotes())[0].song).toBeNull();
  });

  it('links a note written before its song was reviewed, once the song is, without writing a guess', async () => {
    await createNote(note({ subject: 'Living Hope' }));
    expect((await listNotes())[0].song).toBeNull();

    const s = await song('Living Hope', 'Phil Wickham');
    expect((await listNotes())[0].song?.id).toBe(s.id);

    const stored = await prisma.note.findFirstOrThrow();
    expect(stored.songId).toBeNull();
  });

  it('suggests only reviewed songs as subjects', async () => {
    await song('Abide', 'Aaron Williams');
    await song('Not Yet', 'Somebody', 'QUEUED');
    expect(await reviewedSongTitles()).toEqual(['Abide']);
  });
});

describe('notes: moving, editing and deleting', () => {
  it('moves a note between buckets and keeps what was written', async () => {
    const id = await createNote(note({ body: 'Think again.', bucket: 'MAYBE' }));
    expect(await moveNote(id, 'REJECTED')).toBe('MAYBE');
    const [n] = await listNotes();
    expect(n.bucket).toBe('REJECTED');
    expect(n.body).toBe('Think again.');
  });

  it('reports a move of a note that no longer exists', async () => {
    expect(await moveNote('does-not-exist', 'APPROVED')).toBeNull();
  });

  it('re-resolves the link when the subject is corrected, and drops it when cleared', async () => {
    const a = await song('Abide', 'Aaron Williams');
    const b = await song('Holy Forever', 'Chris Tomlin');
    const id = await createNote(note({ subject: 'Abide' }));
    expect((await listNotes())[0].song?.id).toBe(a.id);

    expect(await updateNote(id, note({ subject: 'Holy Forever' }))).toBe(true);
    expect((await listNotes())[0].song?.id).toBe(b.id);

    expect(await updateNote(id, note({ subject: null }))).toBe(true);
    expect((await listNotes())[0].song).toBeNull();
  });

  it('reports an edit of a note that no longer exists', async () => {
    expect(await updateNote('does-not-exist', note())).toBe(false);
  });

  it('deletes a note, and reports deleting one twice', async () => {
    const id = await createNote(note());
    expect(await deleteNote(id)).toBe(true);
    expect(await listNotes()).toHaveLength(0);
    expect(await deleteNote(id)).toBe(false);
  });
});

describe('notes: outliving the catalogue', () => {
  it('survives the song being removed, keeping its subject', async () => {
    const s = await song('Abide', 'Aaron Williams');
    await createNote(note({ body: 'Mine.', subject: 'Abide' }));
    expect((await prisma.note.findFirstOrThrow()).songId).toBe(s.id);

    await prisma.song.delete({ where: { id: s.id } });

    const [n] = await listNotes();
    expect(n.body).toBe('Mine.');
    expect(n.subject).toBe('Abide');
    expect(n.song).toBeNull();
  });
});
