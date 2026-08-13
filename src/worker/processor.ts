import '@/lib/server-guard';
import { prisma } from '@/lib/db';
import { log, events } from '@/lib/logger';
import {
  completeJob,
  enqueueArtistResearch,
  failJob,
  setJobStatus,
} from '@/lib/queue';
import { identifySong, runArtistResearch, runSongReview, PipelineError, type StageName } from '@/lib/ai/pipeline';
import { AiNotConfiguredError } from '@/lib/ai/client';
import { findOrCreateArtist, findOrCreateSong, saveArtistResearch, saveSongReview } from '@/lib/reviews';
import type { ReviewJob } from '@prisma/client';

/**
 * Executes one job.
 *
 * Kept free of the polling loop so the same code path serves the standalone
 * worker process, the optional in-process worker, and the integration tests.
 */

/** Maps a pipeline stage onto the coarse job status shown in the admin UI. */
const STAGE_STATUS: Record<StageName, 'RESEARCHING' | 'ANALYZING' | 'SCORING'> = {
  identify: 'RESEARCHING',
  extract_claims: 'RESEARCHING',
  artist_research: 'RESEARCHING',
  theological: 'ANALYZING',
  communal: 'ANALYZING',
  clarity: 'ANALYZING',
  synthesis: 'ANALYZING',
  score: 'SCORING',
};

export async function processJob(job: ReviewJob): Promise<void> {
  log.info(events.jobStarted, { jobId: job.id, type: job.type, attempt: job.attempts });

  try {
    if (job.type === 'SONG_REVIEW') {
      await processSongReview(job);
    } else {
      await processArtistResearch(job);
    }
  } catch (error) {
    // A missing API key is a configuration problem, not a bad job: retrying
    // would just burn the attempt budget while the key is still absent.
    if (error instanceof AiNotConfiguredError) {
      await failJob(job.id, error, { retryable: false });
      return;
    }
    if (error instanceof PipelineError) {
      await failJob(job.id, error, { retryable: error.retryable });
      await recordEntityError(job, error.message);
      return;
    }
    await failJob(job.id, error, { retryable: true });
    await recordEntityError(job, error instanceof Error ? error.message : String(error));
  }
}

// ---------------------------------------------------------------------------
// Song review
// ---------------------------------------------------------------------------

async function processSongReview(job: ReviewJob): Promise<void> {
  const payload = (job.payload ?? {}) as { title?: string; artist?: string | null; notes?: string | null; requestId?: string | null };

  let songId = job.songId;
  let songTitle = payload.title ?? '';
  let artistName = payload.artist ?? null;
  let album: string | null = null;
  let releaseYear: number | null = null;
  let genre: string | null = null;

  // --- Resolve identity ---------------------------------------------------
  if (songId) {
    const song = await prisma.song.findUnique({
      where: { id: songId },
      include: { artist: { select: { id: true, displayName: true, reviewStatus: true, overallScore: true } } },
    });

    if (!song) {
      await completeJob(job.id, 'Song no longer exists; nothing to review.');
      return;
    }

    // §21: never review the same song twice. A retried or duplicated job that
    // arrives after the review landed exits cleanly instead of overwriting it.
    if (song.reviewStatus === 'COMPLETED' && song.overallScore !== null) {
      log.info(events.duplicateDetected, { songId, reason: 'already_reviewed' });
      await resolveRequest(payload.requestId, songId, 'Song already reviewed.');
      await completeJob(job.id, 'Skipped — a completed review already exists for this song.');
      return;
    }

    songTitle = song.displayTitle;
    artistName = song.artist.displayName;
    album = song.album;
    releaseYear = song.releaseYear;
    genre = song.genre;

    await ensureArtistResearch(song.artist.id, song.artist.displayName, song.artist.reviewStatus, song.artist.overallScore, job.batchId);
  } else {
    // No row yet: identify first, because identity is (artist, title) and we
    // cannot create the song until we know which artist it belongs to.
    if (!songTitle) {
      await failJob(job.id, new Error('Job payload has no song title.'), { retryable: false });
      return;
    }

    await setJobStatus(job.id, 'RESEARCHING', 'Identifying song');
    const { identification } = await identifySong({ title: songTitle, artist: artistName, notes: payload.notes });

    const artist = await findOrCreateArtist(identification.artist);
    const song = await findOrCreateSong({
      title: identification.title,
      artistId: artist.id,
      artistName: artist.displayName,
      album: identification.album,
      releaseYear: identification.releaseYear,
      genre: identification.genre,
    });

    if (song.hasReview) {
      log.info(events.duplicateDetected, { songId: song.id, reason: 'resolved_to_existing_review' });
      await prisma.reviewJob.update({ where: { id: job.id }, data: { songId: song.id, artistId: artist.id } });
      await resolveRequest(payload.requestId, song.id, 'Resolved to an existing review.');
      await completeJob(job.id, `Skipped — "${song.displayTitle}" is already reviewed.`);
      return;
    }

    songId = song.id;
    songTitle = identification.title;
    artistName = artist.displayName;
    album = identification.album ?? null;
    releaseYear = identification.releaseYear ?? null;
    genre = identification.genre ?? null;

    await prisma.reviewJob.update({ where: { id: job.id }, data: { songId: song.id, artistId: artist.id } });

    const artistRecord = await prisma.artist.findUniqueOrThrow({
      where: { id: artist.id },
      select: { reviewStatus: true, overallScore: true },
    });
    await ensureArtistResearch(artist.id, artist.displayName, artistRecord.reviewStatus, artistRecord.overallScore, job.batchId);
  }

  if (!songId || !artistName) {
    await failJob(job.id, new Error('Could not resolve song identity.'), { retryable: false });
    return;
  }

  await prisma.song.update({ where: { id: songId }, data: { reviewStatus: 'IN_PROGRESS', reviewError: null } });

  // --- Run the pipeline ---------------------------------------------------
  const result = await runSongReview({
    title: songTitle,
    artist: artistName,
    known: { title: songTitle, artist: artistName, album, releaseYear, genre },
    onStage: async (stage, note) => {
      await setJobStatus(job.id, STAGE_STATUS[stage], note);
    },
  });

  await saveSongReview(songId, result);
  await resolveRequest(payload.requestId, songId, 'Review completed.');
  await completeJob(
    job.id,
    `Reviewed "${result.identification.title}" — ${result.scores.overallScore}/100 (${result.scores.recommendation}).`,
  );
}

/**
 * §23: artist research is reused, never repeated. Research is only queued when
 * the artist genuinely lacks it; `enqueueArtistResearch` then collapses
 * concurrent requests for the same artist into a single job, so importing 30
 * songs by one artist produces exactly one piece of research.
 */
async function ensureArtistResearch(
  artistId: string,
  artistName: string,
  reviewStatus: string,
  overallScore: number | null,
  batchId: string | null,
): Promise<void> {
  if (reviewStatus === 'COMPLETED' && overallScore !== null) {
    log.info(events.artistResearchReused, { artistId, artistName });
    return;
  }
  const { created } = await enqueueArtistResearch({ artistId, artistName, batchId });
  if (!created) log.info(events.artistResearchReused, { artistId, artistName, reason: 'research_already_queued' });
}

// ---------------------------------------------------------------------------
// Artist research
// ---------------------------------------------------------------------------

async function processArtistResearch(job: ReviewJob): Promise<void> {
  if (!job.artistId) {
    await failJob(job.id, new Error('Artist research job has no artist.'), { retryable: false });
    return;
  }

  const artist = await prisma.artist.findUnique({
    where: { id: job.artistId },
    include: { songs: { select: { displayTitle: true }, take: 5, orderBy: { overallScore: 'desc' } } },
  });

  if (!artist) {
    await completeJob(job.id, 'Artist no longer exists; nothing to research.');
    return;
  }

  const isRefresh = job.type === 'ARTIST_REFRESH';
  if (!isRefresh && artist.reviewStatus === 'COMPLETED' && artist.overallScore !== null) {
    log.info(events.artistResearchReused, { artistId: artist.id });
    await completeJob(job.id, 'Skipped — existing research reused.');
    return;
  }

  await prisma.artist.update({
    where: { id: artist.id },
    data: { reviewStatus: 'IN_PROGRESS', reviewError: null },
  });

  const knownFor = artist.songs.map((s) => s.displayTitle).join(', ') || null;

  const result = await runArtistResearch({
    name: artist.displayName,
    knownFor,
    onStage: async (_stage, note) => {
      await setJobStatus(job.id, 'RESEARCHING', note);
    },
  });

  await setJobStatus(job.id, 'SCORING', 'Applying artist scoring methodology');
  await saveArtistResearch(artist.id, result);
  await completeJob(
    job.id,
    `Researched ${artist.displayName} — ${result.scores.overallScore}/100 from ${result.research.sources.length} sources.`,
  );
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function resolveRequest(requestId: string | null | undefined, songId: string, note: string): Promise<void> {
  if (!requestId) return;
  await prisma.songRequest
    .update({ where: { id: requestId }, data: { status: 'COMPLETED', songId, resolutionNote: note } })
    .catch(() => undefined);
}

/** Mirrors the failure onto the song/artist row so the public UI can explain itself. */
async function recordEntityError(job: ReviewJob, message: string): Promise<void> {
  const trimmed = message.slice(0, 2000);
  try {
    if (job.type === 'SONG_REVIEW' && job.songId) {
      await prisma.song.update({
        where: { id: job.songId },
        data: { reviewStatus: 'FAILED', reviewError: trimmed },
      });
    } else if (job.artistId) {
      await prisma.artist.update({
        where: { id: job.artistId },
        data: { reviewStatus: 'FAILED', reviewError: trimmed },
      });
    }
  } catch {
    // The job record already carries the error; this is a convenience mirror.
  }
}

export function workerId(): string {
  return `${process.env.RAILWAY_REPLICA_ID ?? process.pid}@${process.env.RAILWAY_SERVICE_NAME ?? 'local'}`;
}
