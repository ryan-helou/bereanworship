import './server-guard';
import { prisma } from './db';
import { normalizeTitle } from './normalize';
import type { NoteFieldsInput, NoteBucketValue } from './notes-schema';

/**
 * Private notes: persistence.
 *
 * A note is the owner's decision about a song, not evidence about it, so
 * nothing here is read by the scoring engine or shown on a public page.
 */

export interface LinkedSong {
  id: string;
  slug: string;
  displayTitle: string;
  overallScore: number | null;
  artistName: string;
}

export interface NoteView {
  id: string;
  body: string;
  bucket: NoteBucketValue;
  subject: string | null;
  createdAt: Date;
  updatedAt: Date;
  song: LinkedSong | null;
}

const SONG_SELECT = {
  id: true,
  slug: true,
  displayTitle: true,
  normalizedTitle: true,
  overallScore: true,
  artist: { select: { displayName: true } },
} as const;

/**
 * Reviewed songs keyed by normalised title, keeping only titles that belong to
 * exactly one song.
 *
 * Ambiguity is the reason for the filter: "Forever" is two different songs by
 * two different artists, and linking a note about one to the other would be
 * worse than not linking at all. Only reviewed songs are linked, because only
 * those have a page to link to.
 */
async function uniqueSongsByTitle(titles: string[]): Promise<Map<string, LinkedSong>> {
  const wanted = [...new Set(titles.map(normalizeTitle).filter(Boolean))];
  if (wanted.length === 0) return new Map();

  const songs = await prisma.song.findMany({
    where: { normalizedTitle: { in: wanted }, reviewStatus: 'COMPLETED' },
    select: SONG_SELECT,
  });

  const byTitle = new Map<string, typeof songs>();
  for (const song of songs) byTitle.set(song.normalizedTitle, [...(byTitle.get(song.normalizedTitle) ?? []), song]);

  const unique = new Map<string, LinkedSong>();
  for (const [title, group] of byTitle) {
    if (group.length !== 1) continue;
    const [song] = group;
    unique.set(title, {
      id: song.id,
      slug: song.slug,
      displayTitle: song.displayTitle,
      overallScore: song.overallScore,
      artistName: song.artist.displayName,
    });
  }
  return unique;
}

async function resolveSongId(subject: string | null): Promise<string | null> {
  if (!subject) return null;
  const match = (await uniqueSongsByTitle([subject])).get(normalizeTitle(subject));
  return match?.id ?? null;
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2025';
}

export async function createNote(input: NoteFieldsInput): Promise<string> {
  // Both stamps come from one instant, so a note that has never been touched
  // has updatedAt === createdAt and any later change is strictly later. The
  // page can then say "updated" without a tolerance that would hide a quick
  // edit.
  const now = new Date();
  const note = await prisma.note.create({
    data: {
      body: input.body,
      bucket: input.bucket,
      subject: input.subject,
      songId: await resolveSongId(input.subject),
      createdAt: now,
      updatedAt: now,
    },
    select: { id: true },
  });
  return note.id;
}

/** Returns false when the note no longer exists. */
export async function updateNote(id: string, input: NoteFieldsInput): Promise<boolean> {
  try {
    await prisma.note.update({
      where: { id },
      // Re-resolved every time, so correcting the subject corrects the link.
      data: { body: input.body, bucket: input.bucket, subject: input.subject, songId: await resolveSongId(input.subject) },
    });
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

/** Returns the bucket the note was in, or null when it no longer exists. */
export async function moveNote(id: string, bucket: NoteBucketValue): Promise<NoteBucketValue | null> {
  const existing = await prisma.note.findUnique({ where: { id }, select: { bucket: true } });
  if (!existing) return null;
  await prisma.note.update({ where: { id }, data: { bucket } });
  return existing.bucket;
}

/** Returns false when the note no longer exists. */
export async function deleteNote(id: string): Promise<boolean> {
  try {
    await prisma.note.delete({ where: { id } });
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

/**
 * Every note, newest first.
 *
 * A note written before its song was reviewed has no stored link. It is linked
 * here at read time instead, so notes written today about the backlog find
 * their song on their own once it is published — without a migration or a
 * background job, and without ever writing a guess to the database.
 */
export async function listNotes(): Promise<NoteView[]> {
  const notes = await prisma.note.findMany({
    orderBy: { createdAt: 'desc' },
    take: 1000,
    include: { song: { select: SONG_SELECT } },
  });

  const unlinked = notes.filter((n) => !n.song && n.subject).map((n) => n.subject as string);
  const lateLinks = await uniqueSongsByTitle(unlinked);

  return notes.map((n) => {
    const stored: LinkedSong | null = n.song
      ? {
          id: n.song.id,
          slug: n.song.slug,
          displayTitle: n.song.displayTitle,
          overallScore: n.song.overallScore,
          artistName: n.song.artist.displayName,
        }
      : null;
    return {
      id: n.id,
      body: n.body,
      bucket: n.bucket,
      subject: n.subject,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      song: stored ?? (n.subject ? (lateLinks.get(normalizeTitle(n.subject)) ?? null) : null),
    };
  });
}

/** Titles offered as suggestions while typing a subject. */
export async function reviewedSongTitles(): Promise<string[]> {
  const songs = await prisma.song.findMany({
    where: { reviewStatus: 'COMPLETED' },
    select: { displayTitle: true },
    orderBy: { displayTitle: 'asc' },
  });
  return songs.map((s) => s.displayTitle);
}
