/**
 * Standalone review worker.
 *
 * Runs as its own process (`npm run worker`, or a second Railway service) and
 * polls the job table. Kept separate from the web process on purpose: a review
 * takes minutes and hundreds of thousands of tokens, which has no business
 * happening inside an HTTP request.
 *
 * Concurrency is bounded by WORKER_CONCURRENCY. Because claiming uses
 * `FOR UPDATE SKIP LOCKED`, running several worker processes is safe and is
 * the intended way to scale throughput.
 */

// Load .env when present. In production Railway injects variables directly and
// there is no file — that is expected, not an error.
try {
  process.loadEnvFile();
} catch {
  // No .env file; rely on the real environment.
}

import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { log } from '@/lib/logger';
import { claimNextJob, reclaimStaleJobs } from '@/lib/queue';
import { pruneRateLimits } from '@/lib/ratelimit';
import { processJob, workerId } from './processor';

const id = workerId();
let running = true;
let inFlight = 0;
let idleCycles = 0;

async function tick(): Promise<boolean> {
  let claimedAny = false;

  while (inFlight < env.workerConcurrency) {
    const job = await claimNextJob(id);
    if (!job) break;

    claimedAny = true;
    inFlight += 1;

    void processJob(job)
      .catch((error) => {
        // processJob handles its own failures; this only catches a crash in
        // the failure handling itself, which must not kill the loop.
        log.error('worker.unhandled_job_error', { jobId: job.id, error });
      })
      .finally(() => {
        inFlight -= 1;
      });
  }

  return claimedAny;
}

async function main(): Promise<void> {
  log.info('worker.started', {
    workerId: id,
    concurrency: env.workerConcurrency,
    pollIntervalMs: env.workerPollIntervalMs,
    aiConfigured: env.aiConfigured,
  });

  if (!env.aiConfigured) {
    log.warn('worker.ai_not_configured', {
      message: 'ANTHROPIC_API_KEY is not set. Jobs will fail with a configuration error until it is.',
    });
  }

  while (running) {
    try {
      const claimed = await tick();

      if (claimed) {
        idleCycles = 0;
      } else {
        idleCycles += 1;
        // Housekeeping runs on an idle queue, roughly every few minutes.
        if (idleCycles % 30 === 0) {
          await reclaimStaleJobs();
          await pruneRateLimits();
        }
      }
    } catch (error) {
      log.error('worker.loop_error', { error });
    }

    await sleep(env.workerPollIntervalMs);
  }

  // Let in-flight jobs finish before the process exits.
  const deadline = Date.now() + 60_000;
  while (inFlight > 0 && Date.now() < deadline) {
    log.info('worker.draining', { inFlight });
    await sleep(1000);
  }

  await prisma.$disconnect();
  log.info('worker.stopped', { workerId: id });
  process.exit(0);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shutdown(signal: string): void {
  if (!running) return;
  running = false;
  log.info('worker.shutdown_requested', { signal, inFlight });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => log.error('worker.unhandled_rejection', { reason }));

void main();
