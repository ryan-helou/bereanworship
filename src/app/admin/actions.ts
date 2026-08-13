'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { audit, clearSessionCookie, getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { importSongs, summarizeImport, type ImportResult } from '@/lib/import';
import { cancelJob, enqueueArtistResearch, enqueueSongReview, retryJob } from '@/lib/queue';
import { findOrCreateArtist, findOrCreateSong } from '@/lib/reviews';
import { log } from '@/lib/logger';

/**
 * Admin mutations.
 *
 * Every action re-verifies the session server-side. Next's server actions are
 * already origin-checked against CSRF, but authorization is never assumed from
 * the fact that a handler was reached.
 */

async function requireAdmin(): Promise<string> {
  const session = await getSession();
  if (!session) redirect('/admin/login');
  return session.email;
}

export async function logout(): Promise<void> {
  const session = await getSession();
  await clearSessionCookie();
  if (session) await audit(session.email, 'admin.logout');
  redirect('/admin/login');
}

// ---------------------------------------------------------------------------
// Bulk import
// ---------------------------------------------------------------------------

export type ImportState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'done'; summary: string; result: ImportResult };

export async function runImport(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const actor = await requireAdmin();

  const parsed = z
    .object({
      text: z.string().min(1, 'Paste at least one song.').max(200_000),
      label: z.string().trim().max(200).optional(),
    })
    .safeParse({ text: formData.get('text') ?? '', label: formData.get('label') ?? '' });

  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Invalid submission.' };
  }

  try {
    const result = await importSongs({ text: parsed.data.text, label: parsed.data.label || null });
    await audit(actor, 'import.run', result.batchId, {
      submitted: result.submitted,
      queued: result.queued,
      alreadyReviewed: result.alreadyReviewed,
    });

    revalidatePath('/admin');
    revalidatePath('/admin/jobs');

    return { status: 'done', summary: summarizeImport(result), result };
  } catch (error) {
    log.error('import.failed', { error });
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'The import failed. Check the logs for detail.',
    };
  }
}

// ---------------------------------------------------------------------------
// Queue control
// ---------------------------------------------------------------------------

export async function retryJobAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const jobId = String(formData.get('jobId') ?? '');
  if (!jobId) return;

  await retryJob(jobId);
  await audit(actor, 'job.retry', jobId);
  revalidatePath('/admin/jobs');
  revalidatePath('/admin');
}

export async function cancelJobAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const jobId = String(formData.get('jobId') ?? '');
  if (!jobId) return;

  await cancelJob(jobId);
  await audit(actor, 'job.cancel', jobId);
  revalidatePath('/admin/jobs');
}

export async function retryAllFailedAction(): Promise<void> {
  const actor = await requireAdmin();

  const failed = await prisma.reviewJob.findMany({
    where: { status: { in: ['FAILED', 'NEEDS_REVIEW'] } },
    select: { id: true },
    take: 500,
  });

  for (const job of failed) {
    await retryJob(job.id);
  }

  await audit(actor, 'job.retry_all', undefined, { count: failed.length });
  revalidatePath('/admin/jobs');
  revalidatePath('/admin');
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export async function queueRequestAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const requestId = String(formData.get('requestId') ?? '');
  if (!requestId) return;

  const request = await prisma.songRequest.findUnique({ where: { id: requestId } });
  if (!request) return;

  // When the requester supplied an artist we can resolve identity now and skip
  // the identification stage; otherwise the pipeline resolves it.
  let songId: string | null = null;
  if (request.rawArtist) {
    const artist = await findOrCreateArtist(request.rawArtist);
    const song = await findOrCreateSong({
      title: request.rawTitle,
      artistId: artist.id,
      artistName: artist.displayName,
    });
    songId = song.id;

    if (song.hasReview) {
      await prisma.songRequest.update({
        where: { id: requestId },
        data: { status: 'ALREADY_REVIEWED', songId: song.id, resolutionNote: 'Matched an existing review.' },
      });
      revalidatePath('/admin/requests');
      return;
    }

    if (!artist.hasResearch) {
      await enqueueArtistResearch({ artistId: artist.id, artistName: artist.displayName });
    }
  }

  await enqueueSongReview({
    title: request.rawTitle,
    artist: request.rawArtist,
    notes: request.notes,
    songId,
    requestId,
    // Human requests jump ahead of bulk imports.
    priority: 5,
  });

  await prisma.songRequest.update({ where: { id: requestId }, data: { status: 'QUEUED', songId } });
  await audit(actor, 'request.queue', requestId);

  revalidatePath('/admin/requests');
  revalidatePath('/admin/jobs');
  revalidatePath('/admin');
}

export async function rejectRequestAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const requestId = String(formData.get('requestId') ?? '');
  const note = String(formData.get('note') ?? '').slice(0, 500);
  if (!requestId) return;

  await prisma.songRequest.update({
    where: { id: requestId },
    data: { status: 'REJECTED', resolutionNote: note || 'Rejected by an administrator.' },
  });

  await audit(actor, 'request.reject', requestId, { note });
  revalidatePath('/admin/requests');
}

export async function queueAllPendingRequestsAction(): Promise<void> {
  const actor = await requireAdmin();

  const pending = await prisma.songRequest.findMany({
    where: { status: 'PENDING' },
    orderBy: [{ requestCount: 'desc' }, { createdAt: 'asc' }],
    take: 200,
    select: { id: true },
  });

  for (const request of pending) {
    const formData = new FormData();
    formData.set('requestId', request.id);
    await queueRequestAction(formData);
  }

  await audit(actor, 'request.queue_all', undefined, { count: pending.length });
  revalidatePath('/admin/requests');
}

// ---------------------------------------------------------------------------
// Re-review and refresh
// ---------------------------------------------------------------------------

export async function refreshArtistAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const artistId = String(formData.get('artistId') ?? '');
  if (!artistId) return;

  const artist = await prisma.artist.findUnique({ where: { id: artistId } });
  if (!artist) return;

  await enqueueArtistResearch({
    artistId,
    artistName: artist.displayName,
    refresh: true,
    priority: 20,
  });

  await audit(actor, 'artist.refresh', artistId);
  revalidatePath('/admin/artists');
  revalidatePath('/admin/jobs');
}

export async function rereviewSongAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const songId = String(formData.get('songId') ?? '');
  if (!songId) return;

  const song = await prisma.song.findUnique({ where: { id: songId }, include: { artist: true } });
  if (!song) return;

  // The existing review stays live and published until the new one lands, and
  // is archived to review history at that point rather than overwritten.
  await enqueueSongReview({
    title: song.displayTitle,
    artist: song.artist.displayName,
    songId: song.id,
    priority: 15,
  });

  await audit(actor, 'song.rereview', songId);
  revalidatePath('/admin/songs');
  revalidatePath('/admin/jobs');
}

export async function flagSongAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const songId = String(formData.get('songId') ?? '');
  const note = String(formData.get('note') ?? '').slice(0, 1000);
  const clear = formData.get('clear') === 'true';
  if (!songId) return;

  await prisma.song.update({
    where: { id: songId },
    data: {
      needsAttention: !clear,
      attentionNote: clear ? null : note || 'Flagged for review by an administrator.',
    },
  });

  await audit(actor, clear ? 'song.unflag' : 'song.flag', songId, { note });
  revalidatePath('/admin/songs');
}
