import './server-guard';
import { prisma } from './db';
import { normalizeArtist, normalizeTitle, parseImportLine, type ParsedEntry } from './normalize';
import { findOrCreateArtist, findOrCreateSong } from './reviews';
import { enqueueArtistResearch, enqueueSongReview } from './queue';
import { log, events } from './logger';
import type { Prisma } from '@prisma/client';

/**
 * Bulk import.
 *
 * The pipeline an admin paste goes through:
 *   parse → normalize → de-duplicate within the paste → check the database →
 *   skip anything already reviewed → create rows for what's new → queue.
 *
 * The expensive part — actually reviewing — is never done here. This function
 * returns in well under a second for 200 songs because all it does is resolve
 * identity and enqueue work.
 */

export const MAX_IMPORT_LINES = 1000;
/** The brief requires 200 per batch; the ceiling above leaves plenty of headroom. */
export const RECOMMENDED_BATCH_SIZE = 200;

export type RowOutcome =
  | 'queued'
  | 'already_reviewed'
  | 'already_queued'
  | 'duplicate_in_submission'
  | 'invalid';

export interface ImportRow {
  line: number;
  raw: string;
  title: string;
  artist: string | null;
  outcome: RowOutcome;
  detail?: string;
  songSlug?: string;
}

export interface ImportResult {
  batchId: string;
  submitted: number;
  queued: number;
  alreadyReviewed: number;
  alreadyQueued: number;
  duplicatesInSubmission: number;
  invalid: number;
  artistsCreated: number;
  artistResearchQueued: number;
  rows: ImportRow[];
  warnings: string[];
}

export async function importSongs(input: { text: string; label?: string | null }): Promise<ImportResult> {
  const lines = input.text.split(/\r?\n/);
  const warnings: string[] = [];

  if (lines.length > MAX_IMPORT_LINES) {
    warnings.push(
      `Submission contained ${lines.length} lines; only the first ${MAX_IMPORT_LINES} were processed. Split larger lists into multiple batches.`,
    );
  }

  const parsed: ParsedEntry[] = [];
  for (const [index, line] of lines.slice(0, MAX_IMPORT_LINES).entries()) {
    const entry = parseImportLine(line, index + 1);
    if (entry) parsed.push(entry);
  }

  const batch = await prisma.importBatch.create({
    data: { label: input.label?.slice(0, 200) ?? null, submittedCount: parsed.length },
  });

  const rows: ImportRow[] = [];
  const seen = new Map<string, number>();
  let queued = 0;
  let alreadyReviewed = 0;
  let alreadyQueued = 0;
  let duplicatesInSubmission = 0;
  let invalid = 0;
  let artistsCreated = 0;
  let artistResearchQueued = 0;

  for (const entry of parsed) {
    const normalizedTitle = normalizeTitle(entry.title);
    const normalizedArtistKey = entry.artist ? normalizeArtist(entry.artist) : '';

    if (!normalizedTitle) {
      invalid += 1;
      rows.push({
        line: entry.lineNumber,
        raw: entry.raw,
        title: entry.title,
        artist: entry.artist,
        outcome: 'invalid',
        detail: 'Could not read a song title from this line.',
      });
      continue;
    }

    // --- De-duplicate within this submission ------------------------------
    const key = `${normalizedTitle}::${normalizedArtistKey}`;
    const firstSeenAt = seen.get(key);
    if (firstSeenAt !== undefined) {
      duplicatesInSubmission += 1;
      log.info(events.duplicateDetected, { scope: 'submission', line: entry.lineNumber });
      rows.push({
        line: entry.lineNumber,
        raw: entry.raw,
        title: entry.title,
        artist: entry.artist,
        outcome: 'duplicate_in_submission',
        detail: `Same as line ${firstSeenAt}.`,
      });
      continue;
    }
    seen.set(key, entry.lineNumber);

    try {
      if (entry.artist) {
        // Artist supplied: resolve identity now so the worker can skip the
        // identification stage entirely.
        const artist = await findOrCreateArtist(entry.artist);
        if (artist.created) artistsCreated += 1;

        const song = await findOrCreateSong({
          title: entry.title,
          artistId: artist.id,
          artistName: artist.displayName,
        });

        if (song.hasReview) {
          alreadyReviewed += 1;
          log.info(events.duplicateDetected, { scope: 'database', songId: song.id });
          rows.push({
            line: entry.lineNumber,
            raw: entry.raw,
            title: entry.title,
            artist: entry.artist,
            outcome: 'already_reviewed',
            detail: 'A completed review already exists.',
            songSlug: song.slug,
          });
          continue;
        }

        const { created } = await enqueueSongReview({
          title: entry.title,
          artist: entry.artist,
          songId: song.id,
          batchId: batch.id,
        });

        if (!created) {
          alreadyQueued += 1;
          rows.push({
            line: entry.lineNumber,
            raw: entry.raw,
            title: entry.title,
            artist: entry.artist,
            outcome: 'already_queued',
            detail: 'Already in the review queue.',
            songSlug: song.slug,
          });
          continue;
        }

        // §23: research an artist once, not once per song. This is a no-op when
        // research exists or is already queued.
        if (!artist.hasResearch) {
          const research = await enqueueArtistResearch({
            artistId: artist.id,
            artistName: artist.displayName,
            batchId: batch.id,
          });
          if (research.created) artistResearchQueued += 1;
        }

        queued += 1;
        rows.push({
          line: entry.lineNumber,
          raw: entry.raw,
          title: entry.title,
          artist: entry.artist,
          outcome: 'queued',
          songSlug: song.slug,
        });
      } else {
        // No artist: the pipeline must identify it first, so queue a job
        // carrying only the title.
        const { created } = await enqueueSongReview({
          title: entry.title,
          artist: null,
          batchId: batch.id,
        });

        if (!created) {
          alreadyQueued += 1;
          rows.push({
            line: entry.lineNumber,
            raw: entry.raw,
            title: entry.title,
            artist: null,
            outcome: 'already_queued',
          });
          continue;
        }

        queued += 1;
        rows.push({
          line: entry.lineNumber,
          raw: entry.raw,
          title: entry.title,
          artist: null,
          outcome: 'queued',
          detail: entry.warning ?? 'Artist will be identified during review.',
        });
      }
    } catch (error) {
      invalid += 1;
      const message = error instanceof Error ? error.message : String(error);
      log.error('import.row_failed', { line: entry.lineNumber, error: message });
      rows.push({
        line: entry.lineNumber,
        raw: entry.raw,
        title: entry.title,
        artist: entry.artist,
        outcome: 'invalid',
        detail: message.slice(0, 300),
      });
    }
  }

  const result: ImportResult = {
    batchId: batch.id,
    submitted: parsed.length,
    queued,
    alreadyReviewed,
    alreadyQueued,
    duplicatesInSubmission,
    invalid,
    artistsCreated,
    artistResearchQueued,
    rows,
    warnings,
  };

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      duplicateCount: duplicatesInSubmission,
      existingCount: alreadyReviewed + alreadyQueued,
      queuedCount: queued,
      invalidCount: invalid,
      report: {
        warnings,
        artistsCreated,
        artistResearchQueued,
        // Row detail is capped: a 1000-row report should not bloat the table.
        rows: rows.slice(0, 500),
      } as unknown as Prisma.InputJsonValue,
    },
  });

  log.info(events.importCompleted, {
    batchId: batch.id,
    submitted: parsed.length,
    queued,
    alreadyReviewed,
    duplicatesInSubmission,
  });

  return result;
}

/** Human-readable one-line summary, matching the brief's example output. */
export function summarizeImport(result: ImportResult): string {
  const parts = [`${result.submitted} submitted`];
  if (result.alreadyReviewed) parts.push(`${result.alreadyReviewed} already reviewed`);
  if (result.duplicatesInSubmission) parts.push(`${result.duplicatesInSubmission} duplicate`);
  if (result.alreadyQueued) parts.push(`${result.alreadyQueued} already queued`);
  if (result.invalid) parts.push(`${result.invalid} could not be read`);
  parts.push(`${result.queued} queued`);
  return parts.join(' · ');
}
