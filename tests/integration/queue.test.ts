import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import {
  cancelJob,
  claimNextJob,
  completeJob,
  enqueueArtistResearch,
  enqueueSongReview,
  failJob,
  queueStats,
  reclaimStaleJobs,
  retryJob,
} from '@/lib/queue';
import { findOrCreateArtist, findOrCreateSong } from '@/lib/reviews';

/**
 * Queue mechanics.
 *
 * The claim query is raw SQL against a live database — the only way to test
 * `FOR UPDATE SKIP LOCKED` and the timestamp semantics is to actually run it.
 */

describe('claiming', () => {
  it('claims a due job', async () => {
    await enqueueSongReview({ title: 'A Song', artist: 'An Artist' });
    const job = await claimNextJob('worker-1');

    expect(job).not.toBeNull();
    expect(job!.status).toBe('RESEARCHING');
    expect(job!.attempts).toBe(1);
    expect(job!.lockedBy).toBe('worker-1');
  });

  /**
   * Regression guard. Prisma stores DateTime as `timestamp without time zone`
   * holding a UTC instant; bare `NOW()` is `timestamptz`. Comparing them makes
   * Postgres reinterpret the stored value in the session time zone, so on a
   * non-UTC database every due job looks like it is in the future and the
   * queue claims nothing at all. This test fails loudly if that regresses.
   */
  it('claims due jobs regardless of the database session time zone', async () => {
    await prisma.$executeRawUnsafe(`SET TIME ZONE 'America/Toronto'`);
    try {
      await enqueueSongReview({ title: 'Timezone Song', artist: 'Timezone Artist' });
      const job = await claimNextJob('worker-tz');
      expect(job, 'a due job must be claimable under a non-UTC session time zone').not.toBeNull();
    } finally {
      await prisma.$executeRawUnsafe(`SET TIME ZONE 'UTC'`);
    }
  });

  it('returns null when nothing is due', async () => {
    expect(await claimNextJob('worker-1')).toBeNull();
  });

  it('does not claim a job scheduled for the future', async () => {
    const { job } = await enqueueSongReview({ title: 'Later', artist: 'Someone' });
    await prisma.reviewJob.update({
      where: { id: job.id },
      data: { runAfter: new Date(Date.now() + 60_000) },
    });
    expect(await claimNextJob('worker-1')).toBeNull();
  });

  it('never hands the same job to two workers', async () => {
    await enqueueSongReview({ title: 'Only One', artist: 'Someone' });

    const [a, b] = await Promise.all([claimNextJob('worker-1'), claimNextJob('worker-2')]);
    const claimed = [a, b].filter(Boolean);

    expect(claimed).toHaveLength(1);
  });

  it('claims in priority then age order', async () => {
    await enqueueSongReview({ title: 'Low priority', artist: 'A', priority: 0 });
    await enqueueSongReview({ title: 'High priority', artist: 'B', priority: 10 });

    const first = await claimNextJob('worker-1');
    const payload = first!.payload as { title: string };
    expect(payload.title).toBe('High priority');
  });
});

describe('deduplication', () => {
  it('does not queue a second review for a song already in the queue', async () => {
    const artist = await findOrCreateArtist('Dedupe Artist');
    const song = await findOrCreateSong({ title: 'Dedupe Song', artistId: artist.id, artistName: artist.displayName });

    const first = await enqueueSongReview({ title: 'Dedupe Song', artist: 'Dedupe Artist', songId: song.id });
    const second = await enqueueSongReview({ title: 'Dedupe Song', artist: 'Dedupe Artist', songId: song.id });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.job.id).toBe(first.job.id);
    expect(await prisma.reviewJob.count({ where: { songId: song.id } })).toBe(1);
  });

  it('researches an artist once no matter how many songs arrive', async () => {
    const artist = await findOrCreateArtist('Prolific Artist');

    // Simulates 30 songs by one artist all asking for research.
    const results = [];
    for (let i = 0; i < 30; i += 1) {
      results.push(await enqueueArtistResearch({ artistId: artist.id, artistName: 'Prolific Artist' }));
    }

    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await prisma.reviewJob.count({ where: { artistId: artist.id } })).toBe(1);
  });
});

describe('failure handling', () => {
  it('schedules a retry with backoff while attempts remain', async () => {
    await enqueueSongReview({ title: 'Flaky', artist: 'Someone' });
    const job = await claimNextJob('worker-1');

    const { willRetry } = await failJob(job!.id, new Error('transient provider error'));
    expect(willRetry).toBe(true);

    const after = await prisma.reviewJob.findUniqueOrThrow({ where: { id: job!.id } });
    expect(after.status).toBe('PENDING');
    expect(after.lockedBy).toBeNull();
    expect(after.runAfter.getTime()).toBeGreaterThan(Date.now());
    expect(after.lastError).toContain('transient');
  });

  it('gives up after maxAttempts', async () => {
    const { job } = await enqueueSongReview({ title: 'Doomed', artist: 'Someone' });
    await prisma.reviewJob.update({ where: { id: job.id }, data: { attempts: 3, maxAttempts: 3 } });

    const { willRetry } = await failJob(job.id, new Error('still broken'));
    expect(willRetry).toBe(false);
    expect((await prisma.reviewJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('FAILED');
  });

  it('parks non-retryable failures without spending attempts', async () => {
    await enqueueSongReview({ title: 'Unidentifiable', artist: null });
    const job = await claimNextJob('worker-1');

    const { willRetry } = await failJob(job!.id, new Error('cannot identify'), { retryable: false });
    expect(willRetry).toBe(false);

    const after = await prisma.reviewJob.findUniqueOrThrow({ where: { id: job!.id } });
    expect(after.status).toBe('NEEDS_REVIEW');
    expect(after.attempts).toBe(1);
  });

  it('puts a failed job back on the queue with a fresh attempt budget', async () => {
    const { job } = await enqueueSongReview({ title: 'Retry me', artist: 'Someone' });
    await prisma.reviewJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', attempts: 3, lastError: 'boom' },
    });

    const retried = await retryJob(job.id);
    expect(retried?.status).toBe('PENDING');
    expect(retried?.attempts).toBe(0);
    expect(retried?.lastError).toBeNull();

    expect(await claimNextJob('worker-1')).not.toBeNull();
  });

  it('reclaims a job whose worker died mid-flight', async () => {
    await enqueueSongReview({ title: 'Orphan', artist: 'Someone' });
    const job = await claimNextJob('doomed-worker');

    // Simulate the worker having crashed 30 minutes ago.
    await prisma.reviewJob.update({
      where: { id: job!.id },
      data: { lockedAt: new Date(Date.now() - 30 * 60 * 1000) },
    });

    expect(await reclaimStaleJobs()).toBe(1);
    expect(await claimNextJob('healthy-worker')).not.toBeNull();
  });

  it('does not reclaim a job that is actively running', async () => {
    await enqueueSongReview({ title: 'Working', artist: 'Someone' });
    await claimNextJob('busy-worker');
    expect(await reclaimStaleJobs()).toBe(0);
  });
});

describe('cancellation and stats', () => {
  it('cancels a pending job but leaves a running one alone', async () => {
    const { job: pending } = await enqueueSongReview({ title: 'Cancel me', artist: 'A' });
    expect(await cancelJob(pending.id)).toBe(true);

    await enqueueSongReview({ title: 'Running', artist: 'B' });
    const running = await claimNextJob('worker-1');
    expect(await cancelJob(running!.id)).toBe(false);
  });

  it('reports accurate counts, scoped to a batch when asked', async () => {
    await enqueueSongReview({ title: 'One', artist: 'A', batchId: 'batch-1' });
    await enqueueSongReview({ title: 'Two', artist: 'B', batchId: 'batch-1' });
    await enqueueSongReview({ title: 'Three', artist: 'C', batchId: 'batch-2' });

    const claimed = await claimNextJob('worker-1');
    await completeJob(claimed!.id, 'done');

    const all = await queueStats();
    expect(all.pending + all.completed).toBe(3);

    const batch1 = await queueStats('batch-1');
    expect(batch1.pending + batch1.completed).toBe(2);
  });
});
