import './server-guard';
import { prisma } from './db';
import { env } from './env';
import { log, events } from './logger';
import type { JobStatus, JobType, Prisma, ReviewJob } from '@prisma/client';

/** One entry in a job's stage log. Stored as JSON, so it must be JSON-shaped. */
type StageLogEntry = Prisma.InputJsonValue;

/** Reads the existing stage log defensively — the column is nullable JSON. */
function readStageLog(value: Prisma.JsonValue | null | undefined): StageLogEntry[] {
  return Array.isArray(value) ? (value as StageLogEntry[]) : [];
}

/**
 * Database-backed job queue.
 *
 * Claiming uses `FOR UPDATE SKIP LOCKED`, the standard Postgres pattern for a
 * work queue: several workers can poll the same table concurrently and each
 * takes a different row without blocking the others. No Redis, no broker, no
 * extra service to operate — and the queue is transactionally consistent with
 * the data it is producing.
 */

/** Statuses that mean a worker currently holds the job. */
export const ACTIVE_STATUSES: JobStatus[] = ['RESEARCHING', 'ANALYZING', 'SCORING'];

/** A worker that dies mid-job leaves a lock behind; reclaim after this long. */
const STALE_LOCK_MS = 20 * 60 * 1000;

export interface EnqueueSongInput {
  title: string;
  artist?: string | null;
  notes?: string | null;
  songId?: string | null;
  batchId?: string | null;
  priority?: number;
  requestId?: string | null;
}

/**
 * Queues a song review. Idempotent by design: if an unfinished job already
 * exists for the same song, the existing job is returned rather than a second
 * one created. This is what stops a retry from producing duplicate reviews.
 */
export async function enqueueSongReview(input: EnqueueSongInput): Promise<{ job: ReviewJob; created: boolean }> {
  if (input.songId) {
    const existing = await prisma.reviewJob.findFirst({
      where: {
        songId: input.songId,
        type: 'SONG_REVIEW',
        status: { in: ['PENDING', ...ACTIVE_STATUSES] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return { job: existing, created: false };
  }

  const job = await prisma.reviewJob.create({
    data: {
      type: 'SONG_REVIEW',
      status: 'PENDING',
      songId: input.songId ?? null,
      batchId: input.batchId ?? null,
      priority: input.priority ?? 0,
      maxAttempts: env.workerMaxAttempts,
      payload: {
        title: input.title,
        artist: input.artist ?? null,
        notes: input.notes ?? null,
        requestId: input.requestId ?? null,
      },
    },
  });

  return { job, created: true };
}

export async function enqueueArtistResearch(input: {
  artistId: string;
  artistName: string;
  refresh?: boolean;
  batchId?: string | null;
  priority?: number;
}): Promise<{ job: ReviewJob; created: boolean }> {
  const existing = await prisma.reviewJob.findFirst({
    where: {
      artistId: input.artistId,
      type: { in: ['ARTIST_RESEARCH', 'ARTIST_REFRESH'] },
      status: { in: ['PENDING', ...ACTIVE_STATUSES] },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) return { job: existing, created: false };

  const job = await prisma.reviewJob.create({
    data: {
      type: input.refresh ? 'ARTIST_REFRESH' : 'ARTIST_RESEARCH',
      status: 'PENDING',
      artistId: input.artistId,
      batchId: input.batchId ?? null,
      // Artist research gates song reviews for that artist, so it runs first.
      priority: input.priority ?? 10,
      maxAttempts: env.workerMaxAttempts,
      payload: { artistName: input.artistName, refresh: Boolean(input.refresh) },
    },
  });

  return { job, created: true };
}

/**
 * Atomically claims the highest-priority runnable job.
 *
 * The whole point is the `FOR UPDATE SKIP LOCKED` subquery: two workers
 * running this simultaneously cannot claim the same row, and neither waits on
 * the other.
 *
 * Note the `NOW() AT TIME ZONE 'UTC'`. Prisma maps DateTime to
 * `timestamp without time zone` and writes UTC instants into it, while bare
 * `NOW()` returns `timestamptz`. Comparing the two makes Postgres reinterpret
 * the stored value using the *session* time zone — so on any database whose
 * session is not UTC, `runAfter <= NOW()` is false for jobs that are in fact
 * due, and the queue silently claims nothing. Keeping both sides in UTC makes
 * the comparison correct regardless of server locale.
 */
export async function claimNextJob(workerId: string): Promise<ReviewJob | null> {
  const rows = await prisma.$queryRaw<ReviewJob[]>`
    UPDATE "review_jobs" j
       SET "status"    = 'RESEARCHING',
           "lockedAt"  = (NOW() AT TIME ZONE 'UTC'),
           "lockedBy"  = ${workerId},
           "startedAt" = COALESCE(j."startedAt", (NOW() AT TIME ZONE 'UTC')),
           "attempts"  = j."attempts" + 1,
           "updatedAt" = (NOW() AT TIME ZONE 'UTC')
     WHERE j."id" = (
       SELECT c."id"
         FROM "review_jobs" c
        WHERE c."status" = 'PENDING'
          AND c."runAfter" <= (NOW() AT TIME ZONE 'UTC')
        ORDER BY c."priority" DESC, c."createdAt" ASC
          FOR UPDATE SKIP LOCKED
        LIMIT 1
     )
    RETURNING j.*;
  `;

  const job = rows[0] ?? null;
  if (job) {
    log.info(events.jobClaimed, { jobId: job.id, type: job.type, attempt: job.attempts, workerId });
  }
  return job;
}

export async function setJobStatus(jobId: string, status: JobStatus, note?: string): Promise<void> {
  const job = await prisma.reviewJob.findUnique({ where: { id: jobId }, select: { stageLog: true } });
  const stageLog = readStageLog(job?.stageLog);

  await prisma.reviewJob.update({
    where: { id: jobId },
    data: {
      status,
      stageLog: [...stageLog, { at: new Date().toISOString(), status, note: note ?? null }],
    },
  });
}

export async function completeJob(jobId: string, note?: string): Promise<void> {
  const job = await prisma.reviewJob.findUnique({ where: { id: jobId }, select: { stageLog: true } });
  const stageLog = readStageLog(job?.stageLog);

  await prisma.reviewJob.update({
    where: { id: jobId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: null,
      stageLog: [...stageLog, { at: new Date().toISOString(), status: 'COMPLETED', note: note ?? null }],
    },
  });
  log.info(events.jobCompleted, { jobId, note });
}

/**
 * Records a failure. Retryable failures go back to PENDING with exponential
 * backoff until `maxAttempts`; non-retryable ones (a song that cannot be
 * identified, lyrics that cannot be established) go straight to NEEDS_REVIEW,
 * because retrying them would only burn tokens to reach the same answer.
 */
export async function failJob(
  jobId: string,
  error: unknown,
  options: { retryable?: boolean } = {},
): Promise<{ willRetry: boolean }> {
  const retryable = options.retryable ?? true;
  const message = error instanceof Error ? error.message : String(error);

  const job = await prisma.reviewJob.findUnique({ where: { id: jobId } });
  if (!job) return { willRetry: false };

  const stageLog = readStageLog(job.stageLog);
  const attemptsRemaining = job.attempts < job.maxAttempts;
  const willRetry = retryable && attemptsRemaining;

  if (willRetry) {
    // 1min, 4min, 9min … keeps a transient provider outage from burning attempts.
    const backoffMs = Math.min(30 * 60 * 1000, job.attempts ** 2 * 60 * 1000);
    const runAfter = new Date(Date.now() + backoffMs);

    await prisma.reviewJob.update({
      where: { id: jobId },
      data: {
        status: 'PENDING',
        lockedAt: null,
        lockedBy: null,
        lastError: message.slice(0, 4000),
        runAfter,
        stageLog: [...stageLog, { at: new Date().toISOString(), status: 'RETRY_SCHEDULED', note: message.slice(0, 500) }],
      },
    });
    log.warn(events.jobRetryScheduled, { jobId, attempt: job.attempts, runAfter: runAfter.toISOString() });
  } else {
    await prisma.reviewJob.update({
      where: { id: jobId },
      data: {
        status: retryable ? 'FAILED' : 'NEEDS_REVIEW',
        lockedAt: null,
        lockedBy: null,
        completedAt: new Date(),
        lastError: message.slice(0, 4000),
        stageLog: [...stageLog, { at: new Date().toISOString(), status: 'FAILED', note: message.slice(0, 500) }],
      },
    });
    log.error(events.jobFailed, { jobId, type: job.type, attempts: job.attempts, retryable, error: message });
  }

  return { willRetry };
}

/** Puts a failed job back on the queue, resetting its attempt budget. */
export async function retryJob(jobId: string): Promise<ReviewJob | null> {
  const job = await prisma.reviewJob.findUnique({ where: { id: jobId } });
  if (!job) return null;
  if (!['FAILED', 'NEEDS_REVIEW', 'CANCELLED'].includes(job.status)) return job;

  return prisma.reviewJob.update({
    where: { id: jobId },
    data: {
      status: 'PENDING',
      attempts: 0,
      maxAttempts: env.workerMaxAttempts,
      lastError: null,
      lockedAt: null,
      lockedBy: null,
      runAfter: new Date(),
      completedAt: null,
    },
  });
}

/** Cancels a job that has not started. Running jobs are left alone. */
export async function cancelJob(jobId: string): Promise<boolean> {
  const result = await prisma.reviewJob.updateMany({
    where: { id: jobId, status: 'PENDING' },
    data: { status: 'CANCELLED', completedAt: new Date(), lockedAt: null, lockedBy: null },
  });
  return result.count > 0;
}

/** Returns jobs whose worker died mid-flight to the pending pool. */
export async function reclaimStaleJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_LOCK_MS);
  const result = await prisma.reviewJob.updateMany({
    where: { status: { in: ACTIVE_STATUSES }, lockedAt: { lt: cutoff } },
    data: { status: 'PENDING', lockedAt: null, lockedBy: null, runAfter: new Date() },
  });
  if (result.count > 0) log.warn('review_job.stale_reclaimed', { count: result.count });
  return result.count;
}

export interface QueueStats {
  pending: number;
  active: number;
  completed: number;
  failed: number;
  needsReview: number;
  cancelled: number;
}

export async function queueStats(batchId?: string): Promise<QueueStats> {
  const grouped = await prisma.reviewJob.groupBy({
    by: ['status'],
    _count: { _all: true },
    where: batchId ? { batchId } : undefined,
  });

  const count = (status: JobStatus) => grouped.find((g) => g.status === status)?._count._all ?? 0;

  return {
    pending: count('PENDING'),
    active: count('RESEARCHING') + count('ANALYZING') + count('SCORING'),
    completed: count('COMPLETED'),
    failed: count('FAILED'),
    needsReview: count('NEEDS_REVIEW'),
    cancelled: count('CANCELLED'),
  };
}

export async function jobsByType(type: JobType) {
  return prisma.reviewJob.findMany({ where: { type }, orderBy: { createdAt: 'desc' }, take: 100 });
}
