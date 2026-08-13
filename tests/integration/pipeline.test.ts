import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { setAiProvider } from '@/lib/ai/client';
import { runArtistResearch, runSongReview } from '@/lib/ai/pipeline';
import { findOrCreateArtist, findOrCreateSong, saveArtistResearch, saveSongReview } from '@/lib/reviews';
import { claimNextJob, enqueueArtistResearch, enqueueSongReview } from '@/lib/queue';
import { processJob } from '@/worker/processor';
import { createFakeAi } from './fake-ai';

/**
 * End-to-end pipeline behaviour: research → findings → deterministic scores →
 * persisted, versioned review. Driven by a fake provider so results are exact.
 */

let restore: (() => void) | undefined;

beforeEach(() => {
  restore = setAiProvider(createFakeAi());
});

afterEach(() => {
  restore?.();
});

describe('song review pipeline', () => {
  it('produces scored findings and persists a complete review', async () => {
    const artist = await findOrCreateArtist('Test Artist');
    const song = await findOrCreateSong({ title: 'Test Song', artistId: artist.id, artistName: artist.displayName });

    const result = await runSongReview({
      title: 'Test Song',
      artist: 'Test Artist',
      known: { title: 'Test Song', artist: 'Test Artist' },
    });

    // Every finding carries an auditable score impact.
    expect(result.findings.length).toBeGreaterThan(0);
    for (const finding of result.findings) {
      expect(finding.scoreImpact).not.toBe(0);
    }

    // The score is computed from findings, not asserted by the model.
    expect(result.scores.overallScore).toBe(
      Math.round(
        result.scores.theologicalScore * 0.6 +
          result.scores.communalScore * 0.2 +
          result.scores.clarityScore * 0.2,
      ),
    );

    await saveSongReview(song.id, result);

    const saved = await prisma.song.findUniqueOrThrow({
      where: { id: song.id },
      include: { findings: true, scriptures: true, themes: { include: { theme: true } }, sources: true },
    });

    expect(saved.reviewStatus).toBe('COMPLETED');
    expect(saved.overallScore).toBe(result.scores.overallScore);
    expect(saved.reviewVersion).toBe('v1.0');
    expect(saved.scoringVersion).toBeTruthy();
    expect(saved.summary).toBeTruthy();
    expect(saved.findings.length).toBe(result.findings.length);
    expect(saved.scriptures.length).toBeGreaterThan(0);
    expect(saved.themes.map((t) => t.theme.name)).toContain('Grace');
    expect(saved.sources.length).toBeGreaterThan(0);
  });

  it('withholds the artist from the theological analysis stage', async () => {
    const capture = { prompts: [] as Array<{ stage: string; system: string; prompt: string }> };
    restore?.();
    restore = setAiProvider(createFakeAi({ capture }));

    await runSongReview({
      title: 'Test Song',
      artist: 'Very Distinctive Artist Name',
      known: { title: 'Test Song', artist: 'Very Distinctive Artist Name' },
    });

    const theological = capture.prompts.find((p) => p.stage === 'theological');
    expect(theological).toBeDefined();

    // §54: the artist must play no part in the song's theological score, so
    // the stage that produces it is never told who the artist is.
    expect(theological!.prompt).not.toContain('Very Distinctive Artist Name');
    expect(theological!.system).toContain('THE ARTIST IS IRRELEVANT HERE');
  });

  it('refuses to review when the lyrics cannot be established', async () => {
    restore?.();
    restore = setAiProvider(
      createFakeAi({
        overrides: {
          submit_claims: { lyricsAvailable: false, perspective: 'UNKNOWN', gospelClarity: 'ABSENT', claims: [], structuralNotes: null },
        },
      }),
    );

    await expect(
      runSongReview({ title: 'Unknown Song', artist: 'Nobody', known: { title: 'Unknown Song', artist: 'Nobody' } }),
    ).rejects.toThrow(/could not be established/i);
  });

  it('clamps an over-long lyric excerpt to the copyright limit', async () => {
    restore?.();
    restore = setAiProvider(
      createFakeAi({
        overrides: {
          submit_theological_analysis: {
            assessment: 'Assessment text long enough to satisfy the schema minimum length.',
            doctrinesAffirmed: [],
            strengths: [],
            concerns: [
              {
                category: 'Test',
                title: 'Excerpt clamping',
                explanation: 'A finding whose excerpt exceeds the ten-word copyright ceiling.',
                severity: 'MINOR',
                centrality: 'PERIPHERAL',
                recurring: false,
                lyricExcerpt: 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen',
                scriptureReference: null,
                scriptureExcerpt: null,
                scriptureRationale: null,
              },
            ],
          },
        },
      }),
    );

    const result = await runSongReview({
      title: 'Test Song',
      artist: 'Test Artist',
      known: { title: 'Test Song', artist: 'Test Artist' },
    });

    const finding = result.findings.find((f) => f.lyricExcerpt);
    expect(finding).toBeDefined();
    const words = finding!.lyricExcerpt!.replace('…', '').trim().split(/\s+/);
    expect(words.length).toBeLessThanOrEqual(10);
  });
});

describe('artist research pipeline', () => {
  it('persists findings, sources and a score independent of any song', async () => {
    const artist = await findOrCreateArtist('Test Artist');
    const result = await runArtistResearch({ name: 'Test Artist' });

    await saveArtistResearch(artist.id, result);

    const saved = await prisma.artist.findUniqueOrThrow({
      where: { id: artist.id },
      include: { findings: { include: { source: true } }, sources: { include: { source: true } } },
    });

    expect(saved.reviewStatus).toBe('COMPLETED');
    expect(saved.overallScore).toBe(result.scores.overallScore);
    expect(saved.doctrineScore).not.toBeNull();
    expect(saved.findings.length).toBeGreaterThan(0);
    expect(saved.sources.length).toBeGreaterThan(0);

    // Findings are tied to real source rows, with tiers preserved.
    const withSource = saved.findings.find((f) => f.source);
    expect(withSource?.source?.credibilityTier).toMatch(/TIER_[12]/);
    expect(saved.aliases).toContain('test artist collective');
  });

  it('caps a severe accusation that rests only on weak evidence', async () => {
    const artist = await findOrCreateArtist('Weakly Evidenced Ministry');

    restore?.();
    restore = setAiProvider(
      createFakeAi({
        overrides: {
          submit_artist_research: {
            researchPossible: true,
            artistType: 'MINISTRY',
            aliases: [],
            country: null,
            foundedYear: null,
            websiteUrl: null,
            bio: null,
            summary: 'A ministry about which only low-quality sources make serious claims.',
            evidenceCaveat: 'Sources conflict and the serious claim rests on a blog.',
            strengths: [],
            concerns: [
              {
                component: 'DOCTRINE',
                category: 'Alleged heresy',
                title: 'A severe claim resting on a single blog post',
                explanation: 'An anonymous blog alleges a denial of a central doctrine. Nothing corroborates it.',
                evidence: 'A single blog post.',
                evidenceGrade: 'ALLEGATION',
                severity: 'SEVERE',
                sourceIndex: 0,
              },
            ],
            sources: [
              {
                url: 'https://example.org/some-blog',
                title: 'An anonymous discernment blog',
                publisher: 'Anonymous',
                author: null,
                publicationDate: null,
                sourceType: 'BLOG',
                credibilityTier: 'TIER_4',
                summary: 'Uncorroborated.',
              },
            ],
          },
        },
      }),
    );

    const result = await runArtistResearch({ name: 'Weakly Evidenced Ministry' });
    await saveArtistResearch(artist.id, result);

    const finding = result.findings[0];
    // The claim is still published — but marked contested and scored down.
    expect(finding.severity).toBe('SEVERE');
    expect(finding.contested).toBe(true);
    expect(finding.scoreImpact).toBe(-12);
    expect(result.scores.overallScore).toBeGreaterThan(35);

    const saved = await prisma.artist.findUniqueOrThrow({ where: { id: artist.id } });
    expect(saved.evidenceCaveat).toContain('conflict');
  });

  it('refuses to score an artist when the record is too thin', async () => {
    restore?.();
    restore = setAiProvider(
      createFakeAi({
        overrides: {
          submit_artist_research: {
            researchPossible: false,
            artistType: 'UNKNOWN',
            aliases: [],
            strengths: [],
            concerns: [],
            summary: 'There is not enough public material to evaluate this artist responsibly at all.',
            sources: [],
          },
        },
      }),
    );

    await expect(runArtistResearch({ name: 'Obscure Artist' })).rejects.toThrow(/insufficient public information/i);
  });
});

describe('score independence', () => {
  it('leaves song scores untouched when the artist scores badly', async () => {
    const artist = await findOrCreateArtist('Test Artist');
    const song = await findOrCreateSong({ title: 'Test Song', artistId: artist.id, artistName: artist.displayName });

    const review = await runSongReview({
      title: 'Test Song',
      artist: 'Test Artist',
      known: { title: 'Test Song', artist: 'Test Artist' },
    });
    await saveSongReview(song.id, review);
    const scoreBefore = (await prisma.song.findUniqueOrThrow({ where: { id: song.id } })).overallScore;

    // Now give the artist a catastrophic rating.
    restore?.();
    restore = setAiProvider(
      createFakeAi({
        overrides: {
          submit_artist_research: {
            researchPossible: true,
            artistType: 'MINISTRY',
            aliases: [],
            summary: 'Documented denial of central doctrine, attested by the ministry’s own published teaching.',
            strengths: [],
            concerns: [
              {
                component: 'DOCTRINE',
                category: 'Christology',
                title: 'Published denial of the deity of Christ',
                explanation: 'Their own published teaching denies a doctrine central to Christianity.',
                evidence: 'Stated in their published doctrinal material.',
                evidenceGrade: 'DIRECT_STATEMENT',
                severity: 'SEVERE',
                sourceIndex: 0,
              },
            ],
            sources: [
              {
                url: 'https://example.org/their-own-doctrine',
                title: 'Doctrinal position paper',
                publisher: 'The Ministry',
                author: null,
                publicationDate: null,
                sourceType: 'STATEMENT_OF_FAITH',
                credibilityTier: 'TIER_1',
                summary: 'Their own material.',
              },
            ],
          },
        },
      }),
    );

    const research = await runArtistResearch({ name: 'Test Artist' });
    await saveArtistResearch(artist.id, research);

    const artistAfter = await prisma.artist.findUniqueOrThrow({ where: { id: artist.id } });
    const songAfter = await prisma.song.findUniqueOrThrow({ where: { id: song.id } });

    expect(artistAfter.overallScore).toBeLessThanOrEqual(35);
    // §4: the two ratings are entirely independent.
    expect(songAfter.overallScore).toBe(scoreBefore);
    expect(songAfter.overallScore).toBeGreaterThan(70);
  });
});

describe('worker job processing', () => {
  it('runs a queued song review to completion and reuses artist research', async () => {
    const artist = await findOrCreateArtist('Test Artist');
    const song = await findOrCreateSong({ title: 'Test Song', artistId: artist.id, artistName: artist.displayName });
    await enqueueSongReview({ title: 'Test Song', artist: 'Test Artist', songId: song.id });

    const job = await claimNextJob('test-worker');
    expect(job).not.toBeNull();
    await processJob(job!);

    const done = await prisma.reviewJob.findUniqueOrThrow({ where: { id: job!.id } });
    expect(done.status).toBe('COMPLETED');

    const reviewed = await prisma.song.findUniqueOrThrow({ where: { id: song.id } });
    expect(reviewed.reviewStatus).toBe('COMPLETED');
    expect(reviewed.overallScore).toBeGreaterThan(0);

    // The song review should have queued exactly one artist research job.
    const artistJobs = await prisma.reviewJob.findMany({ where: { type: 'ARTIST_RESEARCH' } });
    expect(artistJobs).toHaveLength(1);
  });

  it('never produces a second review for an already-reviewed song', async () => {
    const artist = await findOrCreateArtist('Test Artist');
    const song = await findOrCreateSong({ title: 'Test Song', artistId: artist.id, artistName: artist.displayName });

    await enqueueSongReview({ title: 'Test Song', artist: 'Test Artist', songId: song.id });
    const first = await claimNextJob('worker-1');
    await processJob(first!);

    const afterFirst = await prisma.song.findUniqueOrThrow({ where: { id: song.id } });

    // A duplicate job arriving later must exit cleanly, not re-review.
    const duplicate = await prisma.reviewJob.create({
      data: { type: 'SONG_REVIEW', status: 'PENDING', songId: song.id, payload: { title: 'Test Song' } },
    });
    // Claim repeatedly until the duplicate comes up: the artist-research job
    // queued by the first review has higher priority and is claimed first.
    let claimed = await claimNextJob('worker-2');
    while (claimed && claimed.id !== duplicate.id) {
      claimed = await claimNextJob('worker-2');
    }
    expect(claimed?.id).toBe(duplicate.id);
    await processJob(claimed!);

    const afterSecond = await prisma.song.findUniqueOrThrow({ where: { id: song.id } });
    expect(afterSecond.reviewedAt?.getTime()).toBe(afterFirst.reviewedAt?.getTime());
    expect(afterSecond.reviewVersion).toBe('v1.0');

    // And no history entry was written, because nothing was superseded.
    expect(await prisma.reviewHistory.count({ where: { songId: song.id } })).toBe(0);
  });

  it('archives the previous review rather than overwriting it on re-review', async () => {
    const artist = await findOrCreateArtist('Test Artist');
    const song = await findOrCreateSong({ title: 'Test Song', artistId: artist.id, artistName: artist.displayName });

    const review = await runSongReview({
      title: 'Test Song',
      artist: 'Test Artist',
      known: { title: 'Test Song', artist: 'Test Artist' },
    });
    await saveSongReview(song.id, review);
    await saveSongReview(song.id, review);

    const updated = await prisma.song.findUniqueOrThrow({ where: { id: song.id } });
    const history = await prisma.reviewHistory.findMany({ where: { songId: song.id } });

    expect(updated.reviewVersion).toBe('v1.1');
    expect(history).toHaveLength(1);
    expect(history[0].reviewVersion).toBe('v1.0');
    expect(history[0].overallScore).toBe(review.scores.overallScore);
  });

  it('parks an unidentifiable song without burning retries', async () => {
    restore?.();
    restore = setAiProvider(
      createFakeAi({
        overrides: {
          submit_identification: {
            resolved: false,
            confidence: 'LOW',
            title: 'Unknown',
            artist: 'Unknown',
            artistType: 'UNKNOWN',
            isPublicDomain: false,
          },
        },
      }),
    );

    await enqueueSongReview({ title: 'Definitely Not A Real Song', artist: null });
    const job = await claimNextJob('test-worker');
    await processJob(job!);

    const failed = await prisma.reviewJob.findUniqueOrThrow({ where: { id: job!.id } });
    // Non-retryable: retrying would spend tokens to reach the same answer.
    expect(failed.status).toBe('NEEDS_REVIEW');
    expect(failed.attempts).toBe(1);
    expect(failed.lastError).toMatch(/could not identify/i);
  });

  it('fails a job cleanly when the AI provider is not configured', async () => {
    restore?.();
    // The real provider with no API key present.
    const artist = await findOrCreateArtist('Test Artist');
    const song = await findOrCreateSong({ title: 'Test Song', artistId: artist.id, artistName: artist.displayName });
    await enqueueSongReview({ title: 'Test Song', artist: 'Test Artist', songId: song.id });

    const job = await claimNextJob('test-worker');
    await processJob(job!);

    const failed = await prisma.reviewJob.findUniqueOrThrow({ where: { id: job!.id } });
    expect(failed.status).toBe('NEEDS_REVIEW');
    expect(failed.lastError).toMatch(/not configured/i);

    restore = setAiProvider(createFakeAi());
  });

  it('reuses completed artist research instead of re-researching', async () => {
    const artist = await findOrCreateArtist('Test Artist');
    const research = await runArtistResearch({ name: 'Test Artist' });
    await saveArtistResearch(artist.id, research);

    await enqueueArtistResearch({ artistId: artist.id, artistName: 'Test Artist' });
    const job = await claimNextJob('test-worker');
    await processJob(job!);

    const done = await prisma.reviewJob.findUniqueOrThrow({ where: { id: job!.id } });
    expect(done.status).toBe('COMPLETED');
    const stageLog = done.stageLog as Array<{ note?: string }>;
    expect(stageLog.at(-1)?.note).toMatch(/reused/i);
  });
});
