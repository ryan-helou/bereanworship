import './server-guard';
import { z } from 'zod';
import { prisma } from './db';
import {
  ArtistResearchSchema,
  ClaimExtractionSchema,
  ClarityAnalysisSchema,
  CommunalAnalysisSchema,
  IdentificationSchema,
  SynthesisSchema,
  TheologicalAnalysisSchema,
  THEME_VOCABULARY,
  evidenceCoverage,
} from './ai/schemas';
import {
  prepareArtistFindings,
  prepareSongFindings,
  type ArtistResearchResult,
  type SongReviewResult,
} from './ai/pipeline';
import { scoreArtist, scoreSong, scoreVocalRange, type ScorableArtistFinding, type ScorableSongFinding } from './scoring';
import { findOrCreateArtist, findOrCreateSong, saveArtistResearch, saveSongReview } from './reviews';
import { log } from './logger';

/**
 * Applying a review produced by a human researcher.
 *
 * This exists because research does not have to come from the worker. A
 * researcher — or Claude Code acting as one — can do the reading, produce the
 * findings, and hand them to the site.
 *
 * What makes that trustworthy rather than a back door is that this path is not
 * a shortcut around the methodology:
 *
 *   · input is validated by the SAME Zod schemas the pipeline stages use, so a
 *     manual review cannot contain a shape the pipeline could not produce —
 *     including the ten-word lyric excerpt cap, enforced by the schema
 *     transform rather than by good intentions;
 *   · findings are scored by the SAME deterministic engine. Supplying a score
 *     is impossible: the payload has no field for one;
 *   · persistence goes through the SAME saveSongReview / saveArtistResearch
 *     path, so versioning, review history and the audit trail are identical.
 *
 * The only difference from an automated review is who produced the findings.
 */

export const SongReviewPayload = z.object({
  kind: z.literal('song'),
  identification: IdentificationSchema,
  claims: ClaimExtractionSchema,
  theological: TheologicalAnalysisSchema,
  communal: CommunalAnalysisSchema,
  clarity: ClarityAnalysisSchema,
  synthesis: SynthesisSchema,
  /** Pages actually consulted; recorded as sources on the song. */
  sources: z.array(z.string().url()).default([]),
});

export const ArtistResearchPayload = z.object({
  kind: z.literal('artist'),
  /** Who is being researched — not part of the research payload itself. */
  artist: z.string().min(1).max(200),
  research: ArtistResearchSchema,
});

export const ReviewPayload = z.discriminatedUnion('kind', [SongReviewPayload, ArtistResearchPayload]);

export interface AppliedSong {
  kind: 'song';
  slug: string;
  title: string;
  artist: string;
  reviewVersion: string;
  /** null for any criterion with no findings — unrated, not zero. */
  overall: number | null;
  theological: number | null;
  communal: number | null;
  clarity: number | null;
  recommendation: string;
  ceiling: number | null;
  /** Criteria excluded from the average for want of evidence. */
  unrated: string[];
  findingCount: number;
  sourceCount: number;
  themes: string[];
  /** How many findings a reader can check — by the words shown, or the place named. */
  evidence: { quoted: number; located: number; grounded: number; total: number; ratio: number; quotedWords: number };
  /** Congregational range difficulty, or null when the pitches were not measured. */
  range: { score: number; label: string; lowest: string; highest: string } | null;
}

export interface AppliedArtist {
  kind: 'artist';
  slug: string;
  name: string;
  reviewVersion: string;
  overall: number;
  doctrine: number;
  publicTeaching: number;
  affiliations: number;
  ministryContext: number;
  recommendation: string;
  findingCount: number;
  sourceCount: number;
}

export type AppliedReview = AppliedSong | AppliedArtist;

export async function applyReview(payload: z.infer<typeof ReviewPayload>): Promise<AppliedReview> {
  return payload.kind === 'song' ? applySong(payload) : applyArtist(payload);
}

async function applySong(payload: z.infer<typeof SongReviewPayload>): Promise<AppliedSong> {
  const { identification, claims, theological, communal, clarity, synthesis, sources } = payload;

  const artist = await findOrCreateArtist(identification.artist);
  const song = await findOrCreateSong({
    title: identification.title,
    artistId: artist.id,
    artistName: artist.displayName,
    album: identification.album,
    releaseYear: identification.releaseYear,
    genre: identification.genre,
  });

  // Findings → score. Never the other way round.
  const findings = prepareSongFindings({ theological, communal, clarity });
  const scores = scoreSong(findings as ScorableSongFinding[]);

  // A review with no findings in any criterion has nothing to judge. Under the
  // old baseline it would have scored 70 and published as "recommended with
  // caution"; the rubric refuses instead of inventing a number.
  if (scores.overallScore === null) {
    throw new Error(
      'This review has no findings in any criterion, so there is nothing to score. ' +
        'Add findings, or leave the song unreviewed.',
    );
  }
  if (scores.unrated.length > 0) {
    log.warn('review.unrated_criteria', {
      unrated: scores.unrated,
      note: 'These criteria had no findings and were excluded from the weighted average.',
    });
  }

  const allowed = new Set<string>(THEME_VOCABULARY);
  const themes = [...new Set(synthesis.themes)].filter((t) => allowed.has(t));

  // Visible rather than silent: a review whose findings cannot be checked —
  // neither quoting the song nor saying where in it they come from — is weak,
  // and weakness should be reported. Note this measures *grounding*, not
  // quoting: a review that quotes little and locates everything is the shape
  // we are aiming for, and scores full marks here.
  const evidence = evidenceCoverage(findings);
  if (evidence.ratio < 0.9) {
    log.warn('review.thin_evidence', {
      grounded: evidence.grounded,
      total: evidence.total,
      note: 'Some findings neither quote the song nor say where in it they sit, so a reader cannot check them.',
    });
  }

  const result: SongReviewResult = {
    identification,
    claims,
    theological,
    communal,
    clarity,
    synthesis,
    findings,
    scores,
    themes,
    citations: sources,
    stages: [],
    usage: { inputTokens: 0, outputTokens: 0 },
  };

  await saveSongReview(song.id, result);

  const saved = await prisma.song.findUniqueOrThrow({
    where: { id: song.id },
    include: { artist: { select: { displayName: true } } },
  });

  log.info('review.applied_manually', {
    songId: saved.id,
    overall: scores.overallScore,
    reviewVersion: saved.reviewVersion,
  });

  return {
    kind: 'song',
    slug: saved.slug,
    title: saved.displayTitle,
    artist: saved.artist.displayName,
    reviewVersion: saved.reviewVersion ?? 'v1.0',
    overall: scores.overallScore,
    theological: scores.theologicalScore,
    communal: scores.communalScore,
    clarity: scores.clarityScore,
    recommendation: scores.recommendation,
    ceiling: scores.overallCeiling,
    unrated: scores.unrated,
    findingCount: findings.length,
    sourceCount: sources.length,
    themes,
    evidence,
    range: (() => {
      const measured = communal.range?.measured ? communal.range : null;
      if (!measured) return null;
      const scored = scoreVocalRange({
        lowest: measured.lowestNote,
        highest: measured.highestNote,
        tessituraLow: measured.tessituraLow,
        tessituraHigh: measured.tessituraHigh,
      });
      return scored ? { score: scored.score, label: scored.label, lowest: scored.lowest, highest: scored.highest } : null;
    })(),
  };
}

async function applyArtist(payload: z.infer<typeof ArtistResearchPayload>): Promise<AppliedArtist> {
  const { artist: name, research } = payload;

  const artist = await findOrCreateArtist(name);
  const findings = prepareArtistFindings(research);
  const scores = scoreArtist(findings as ScorableArtistFinding[]);

  const result: ArtistResearchResult = {
    research,
    findings,
    scores,
    citations: research.sources.map((s) => s.url),
    stages: [],
    usage: { inputTokens: 0, outputTokens: 0 },
  };

  await saveArtistResearch(artist.id, result);
  const saved = await prisma.artist.findUniqueOrThrow({ where: { id: artist.id } });

  log.info('artist_research.applied_manually', {
    artistId: saved.id,
    overall: scores.overallScore,
    reviewVersion: saved.reviewVersion,
  });

  return {
    kind: 'artist',
    slug: saved.slug,
    name: saved.displayName,
    reviewVersion: saved.reviewVersion ?? 'v1.0',
    overall: scores.overallScore,
    doctrine: scores.doctrineScore,
    publicTeaching: scores.publicTeachingScore,
    affiliations: scores.affiliationScore,
    ministryContext: scores.ministryContextScore,
    recommendation: scores.recommendation,
    findingCount: findings.length,
    sourceCount: research.sources.length,
  };
}

/**
 * Clears the catalogue. Themes are reference data the pipeline depends on and
 * are never removed.
 *
 * Exposed to the admin because a real deployment accumulates test imports and
 * needs a supported way to start clean — the alternative is people reaching
 * for psql, which is worse.
 */
export async function purgeCatalogue(): Promise<{ songs: number; artists: number; sources: number; jobs: number; requests: number }> {
  const before = {
    songs: await prisma.song.count(),
    artists: await prisma.artist.count(),
    sources: await prisma.source.count(),
    jobs: await prisma.reviewJob.count(),
    requests: await prisma.songRequest.count(),
  };

  await prisma.reviewJob.deleteMany({});
  await prisma.songRequest.deleteMany({});
  await prisma.importBatch.deleteMany({});
  await prisma.reviewHistory.deleteMany({});
  await prisma.song.deleteMany({});
  await prisma.artist.deleteMany({});
  await prisma.source.deleteMany({});

  log.warn('catalogue.purged', before);
  return before;
}
