import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { findExistingReview, findOrCreateArtist, findOrCreateSong, nextReviewVersion } from '@/lib/reviews';
import { importSongs, summarizeImport } from '@/lib/import';
import { searchArtists, searchSongs, suggest } from '@/lib/search';
import { scoreSong } from '@/lib/scoring';

/**
 * Catalogue behaviour: identity, duplicate prevention, bulk import and search.
 * All against a real database, because every one of these depends on Postgres
 * semantics (unique constraints, trigram matching, tsvector triggers).
 */

/** Publishes a minimal completed review so the record is publicly visible. */
async function publish(title: string, artistName: string, overrides: Record<string, unknown> = {}) {
  const artist = await findOrCreateArtist(artistName);
  const song = await findOrCreateSong({ title, artistId: artist.id, artistName: artist.displayName });
  const scores = scoreSong([]);

  await prisma.song.update({
    where: { id: song.id },
    data: {
      overallScore: scores.overallScore,
      theologicalScore: scores.theologicalScore,
      communalScore: scores.communalScore,
      clarityScore: scores.clarityScore,
      recommendation: scores.recommendation,
      summary: `A review of ${title}.`,
      reviewStatus: 'COMPLETED',
      reviewVersion: 'v1.0',
      reviewedAt: new Date(),
      ...overrides,
    },
  });

  return { artist, song };
}

describe('song identity', () => {
  it('treats differently-cased and spaced titles as one song', async () => {
    const artist = await findOrCreateArtist('John Newton');
    const first = await findOrCreateSong({ title: 'How Great Thou Art', artistId: artist.id, artistName: 'John Newton' });
    const second = await findOrCreateSong({ title: '  HOW GREAT THOU ART  ', artistId: artist.id, artistName: 'John Newton' });

    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
    expect(await prisma.song.count()).toBe(1);
  });

  it('keeps same-titled songs by different artists separate', async () => {
    const a = await findOrCreateArtist('All Sons & Daughters');
    const b = await findOrCreateArtist('Casting Crowns');

    const songA = await findOrCreateSong({ title: 'Great Are You Lord', artistId: a.id, artistName: a.displayName });
    const songB = await findOrCreateSong({ title: 'Great Are You Lord', artistId: b.id, artistName: b.displayName });

    expect(songA.id).not.toBe(songB.id);
    expect(songA.slug).not.toBe(songB.slug);
    expect(await prisma.song.count()).toBe(2);
  });

  it('refuses a duplicate at the database level, not just in code', async () => {
    const artist = await findOrCreateArtist('Some Artist');
    await findOrCreateSong({ title: 'A Song', artistId: artist.id, artistName: 'Some Artist' });

    // Bypassing the helper must still be impossible.
    await expect(
      prisma.song.create({
        data: {
          displayTitle: 'A Song',
          canonicalTitle: 'A Song',
          normalizedTitle: 'a song',
          slug: 'a-song-duplicate',
          artistId: artist.id,
        },
      }),
    ).rejects.toThrow();
  });

  it('resolves an artist by alias', async () => {
    const artist = await findOrCreateArtist('The Porter’s Gate');
    await prisma.artist.update({ where: { id: artist.id }, data: { aliases: ['porters gate worship project'] } });

    const again = await findOrCreateArtist('Porters Gate Worship Project');
    expect(again.created).toBe(false);
    expect(again.id).toBe(artist.id);
  });

  it('generates unique slugs when two artists share a name shape', async () => {
    const a = await findOrCreateArtist('Rivers');
    const b = await prisma.artist.create({
      data: { displayName: 'Rivers', canonicalName: 'Rivers', normalizedName: 'rivers two', slug: 'rivers-2' },
    });
    expect(a.slug).not.toBe(b.slug);
  });
});

describe('findExistingReview', () => {
  it('finds a completed review by title and artist', async () => {
    await publish('Amazing Grace', 'John Newton');

    const found = await findExistingReview('amazing grace', 'john newton');
    expect(found?.displayTitle).toBe('Amazing Grace');
    expect(found?.reviewStatus).toBe('COMPLETED');
  });

  it('does not confuse the same title by a different artist', async () => {
    await publish('Great Are You Lord', 'All Sons & Daughters');

    const wrongArtist = await findExistingReview('Great Are You Lord', 'Casting Crowns');
    expect(wrongArtist).toBeNull();
  });

  it('returns null for an unreviewed song', async () => {
    expect(await findExistingReview('Never Reviewed', 'Nobody')).toBeNull();
  });
});

describe('review versioning', () => {
  it('increments the minor version under the same methodology', () => {
    expect(nextReviewVersion(null, null, null)).toBe('v1.0');
    expect(nextReviewVersion('v1.0', '1.0.0', '1.0.0')).toBe('v1.1');
    expect(nextReviewVersion('v1.7', '1.0.0', '1.0.0')).toBe('v1.8');
  });

  it('bumps the major version when the methodology has moved', () => {
    // Scores from a different scoring version are not comparable.
    expect(nextReviewVersion('v1.3', '0.9.0', '1.0.0')).toBe('v2.0');
    expect(nextReviewVersion('v2.1', '1.0.0', '0.9.0')).toBe('v3.0');
  });
});

describe('bulk import', () => {
  it('parses, de-duplicates and queues a mixed list', async () => {
    const result = await importSongs({
      label: 'Test batch',
      text: [
        'Amazing Grace — John Newton',
        'Holy, Holy, Holy | Reginald Heber',
        '"It Is Well","Horatio Spafford"',
        'Come Thou Fount by Robert Robinson',
        'Amazing Grace — John Newton', // duplicate within the paste
        '# a comment',
        '',
        'Orphan Song', // no artist
      ].join('\n'),
    });

    expect(result.submitted).toBe(6);
    expect(result.queued).toBe(5);
    expect(result.duplicatesInSubmission).toBe(1);
    expect(result.invalid).toBe(0);
    expect(result.artistsCreated).toBe(4);

    // One research job per artist, not one per song.
    expect(result.artistResearchQueued).toBe(4);

    const jobs = await prisma.reviewJob.findMany({ where: { batchId: result.batchId } });
    expect(jobs.filter((j) => j.type === 'SONG_REVIEW')).toHaveLength(5);
    expect(jobs.filter((j) => j.type === 'ARTIST_RESEARCH')).toHaveLength(4);
  });

  it('skips songs that already have a completed review', async () => {
    await publish('Amazing Grace', 'John Newton');

    const result = await importSongs({
      text: ['Amazing Grace — John Newton', 'Holy Holy Holy — Reginald Heber'].join('\n'),
    });

    expect(result.alreadyReviewed).toBe(1);
    expect(result.queued).toBe(1);
    expect(result.rows.find((r) => r.outcome === 'already_reviewed')?.songSlug).toBeTruthy();
    expect(summarizeImport(result)).toContain('already reviewed');
  });

  it('researches one artist once across many of their songs', async () => {
    const lines = Array.from({ length: 30 }, (_, i) => `Song Number ${i + 1} — One Prolific Artist`);
    const result = await importSongs({ text: lines.join('\n') });

    expect(result.queued).toBe(30);
    // §23: thirty songs, one piece of artist research.
    expect(result.artistResearchQueued).toBe(1);
    expect(await prisma.reviewJob.count({ where: { type: 'ARTIST_RESEARCH' } })).toBe(1);
  });

  it('handles a 200-song batch', async () => {
    const lines = Array.from({ length: 200 }, (_, i) => `Bulk Song ${i + 1} — Artist ${(i % 20) + 1}`);
    const result = await importSongs({ text: lines.join('\n'), label: 'Two hundred' });

    expect(result.submitted).toBe(200);
    expect(result.queued).toBe(200);
    expect(result.artistsCreated).toBe(20);
    expect(result.artistResearchQueued).toBe(20);

    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: result.batchId } });
    expect(batch.queuedCount).toBe(200);
  });

  it('records a batch report the admin can inspect', async () => {
    const result = await importSongs({ text: 'A Song — An Artist', label: 'Reportable' });
    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: result.batchId } });

    expect(batch.label).toBe('Reportable');
    expect(batch.submittedCount).toBe(1);
    expect(batch.report).toBeTruthy();
  });
});

describe('search', () => {
  it('finds songs by partial title, ignoring case', async () => {
    await publish('Amazing Grace', 'John Newton');
    await publish('Amazing Grace (My Chains Are Gone)', 'Chris Tomlin');

    const results = await searchSongs({ q: 'amazing' });
    expect(results.total).toBe(2);

    const upper = await searchSongs({ q: 'AMAZING GRACE' });
    expect(upper.items.some((s) => s.displayTitle === 'Amazing Grace')).toBe(true);
  });

  it('finds a song by its artist, including a partial name', async () => {
    await publish('How Great Is Our God', 'Chris Tomlin');

    const byFullName = await searchSongs({ q: 'Chris Tomlin' });
    expect(byFullName.total).toBe(1);

    const byPartial = await searchSongs({ q: 'tomlin' });
    expect(byPartial.total).toBe(1);
  });

  it('tolerates a misspelling', async () => {
    await publish('How Great Is Our God', 'Chris Tomlin');
    const typo = await searchSongs({ q: 'tomlim' });
    expect(typo.total).toBe(1);
  });

  it('ignores punctuation and apostrophes', async () => {
    await publish("Holy, Holy, Holy!", 'Reginald Heber');
    const results = await searchSongs({ q: 'holy holy holy' });
    expect(results.total).toBe(1);
  });

  it('searches album and genre', async () => {
    await publish('A Song', 'An Artist', { album: 'Olney Hymns', genre: 'Traditional Hymn' });

    expect((await searchSongs({ q: 'Olney' })).total).toBe(1);
    expect((await searchSongs({ q: 'Traditional Hymn' })).total).toBe(1);
  });

  it('hides songs that have not completed review', async () => {
    const artist = await findOrCreateArtist('Unreviewed Artist');
    await findOrCreateSong({ title: 'Unreviewed Song', artistId: artist.id, artistName: artist.displayName });

    expect((await searchSongs({ q: 'Unreviewed' })).total).toBe(0);
    expect((await searchSongs({})).total).toBe(0);
  });

  it('sorts by score, title and review date', async () => {
    await publish('Bravo Song', 'Artist One', { overallScore: 90, reviewedAt: new Date('2026-01-01') });
    await publish('Alpha Song', 'Artist Two', { overallScore: 50, reviewedAt: new Date('2026-06-01') });

    expect((await searchSongs({ sort: 'score_desc' })).items[0].displayTitle).toBe('Bravo Song');
    expect((await searchSongs({ sort: 'score_asc' })).items[0].displayTitle).toBe('Alpha Song');
    expect((await searchSongs({ sort: 'title_asc' })).items[0].displayTitle).toBe('Alpha Song');
    expect((await searchSongs({ sort: 'title_desc' })).items[0].displayTitle).toBe('Bravo Song');
    expect((await searchSongs({ sort: 'newest' })).items[0].displayTitle).toBe('Alpha Song');
    expect((await searchSongs({ sort: 'oldest' })).items[0].displayTitle).toBe('Bravo Song');
  });

  it('filters by score range and recommendation', async () => {
    await publish('High', 'Artist One', { overallScore: 95, recommendation: 'RECOMMENDED' });
    await publish('Low', 'Artist Two', { overallScore: 30, recommendation: 'NOT_RECOMMENDED' });

    expect((await searchSongs({ minScore: 80 })).total).toBe(1);
    expect((await searchSongs({ maxScore: 50 })).total).toBe(1);
    expect((await searchSongs({ recommendation: 'NOT_RECOMMENDED' })).items[0].displayTitle).toBe('Low');
  });

  it('filters by theme', async () => {
    const { song } = await publish('Grace Song', 'An Artist');
    const theme = await prisma.theme.findUniqueOrThrow({ where: { name: 'Grace' } });
    await prisma.songTheme.create({ data: { songId: song.id, themeId: theme.id } });

    expect((await searchSongs({ theme: theme.slug })).total).toBe(1);
    expect((await searchSongs({ theme: 'heaven' })).total).toBe(0);
  });

  it('paginates without losing or repeating rows', async () => {
    for (let i = 1; i <= 15; i += 1) {
      await publish(`Paged Song ${String(i).padStart(2, '0')}`, `Paged Artist ${i}`);
    }

    const first = await searchSongs({ perPage: 10, page: 1, sort: 'title_asc' });
    const second = await searchSongs({ perPage: 10, page: 2, sort: 'title_asc' });

    expect(first.total).toBe(15);
    expect(first.totalPages).toBe(2);
    expect(first.items).toHaveLength(10);
    expect(second.items).toHaveLength(5);

    const ids = new Set([...first.items, ...second.items].map((s) => s.id));
    expect(ids.size).toBe(15);
  });

  it('returns nothing rather than everything for a nonsense query', async () => {
    await publish('Amazing Grace', 'John Newton');
    expect((await searchSongs({ q: 'zzzzqqqxyw' })).total).toBe(0);
  });

  it('finds artists by name and by one of their songs', async () => {
    await publish('How Great Is Our God', 'Chris Tomlin');

    expect((await searchArtists({ q: 'tomlin' })).total).toBe(1);
    expect((await searchArtists({ q: 'How Great' })).total).toBe(1);
  });

  it('counts only completed songs against an artist', async () => {
    const { artist } = await publish('Reviewed', 'Mixed Artist');
    await findOrCreateSong({ title: 'Not Reviewed', artistId: artist.id, artistName: artist.displayName });

    const results = await searchArtists({ q: 'Mixed Artist' });
    expect(results.items[0].songCount).toBe(1);
  });

  it('suggests both artists and songs', async () => {
    await publish('Amazing Grace', 'John Newton');

    const suggestions = await suggest('amaz');
    expect(suggestions.some((s) => s.type === 'song' && s.label === 'Amazing Grace')).toBe(true);
    expect(suggestions.every((s) => s.href.startsWith('/'))).toBe(true);
  });

  it('ignores a query that is too short to be useful', async () => {
    await publish('Amazing Grace', 'John Newton');
    expect(await suggest('a')).toEqual([]);
  });
});
