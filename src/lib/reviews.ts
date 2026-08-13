import './server-guard';
import { prisma } from './db';
import type { Prisma } from '@prisma/client';
import { canonicalize, normalizeArtist, normalizeTitle, slugify, songSlug } from './normalize';
import { DEFAULT_REVIEW_VERSION, METHODOLOGY_VERSION, SCORING_VERSION } from './scoring';
import type { ArtistResearchResult, SongReviewResult } from './ai/pipeline';
import { log, events } from './logger';

/**
 * Write side of the review system.
 *
 * Two invariants are enforced here rather than trusted to callers:
 *   1. Identity is (artist, normalized title). A song is never duplicated.
 *   2. A review is never silently overwritten — the previous version is
 *      snapshotted into review_history before the live record changes.
 */

// ---------------------------------------------------------------------------
// Versioning
// ---------------------------------------------------------------------------

/**
 * v1.0 → v1.1 for a re-review under the same methodology; → v2.0 when the
 * scoring or methodology version has moved, since the numbers are then not
 * comparable with the previous review.
 */
export function nextReviewVersion(
  current: string | null | undefined,
  previousScoringVersion: string | null | undefined,
  previousMethodologyVersion: string | null | undefined,
): string {
  if (!current) return DEFAULT_REVIEW_VERSION;

  const match = /^v(\d+)\.(\d+)$/.exec(current);
  if (!match) return DEFAULT_REVIEW_VERSION;

  const major = Number.parseInt(match[1], 10);
  const minor = Number.parseInt(match[2], 10);

  const methodologyMoved =
    previousScoringVersion !== SCORING_VERSION || previousMethodologyVersion !== METHODOLOGY_VERSION;

  return methodologyMoved ? `v${major + 1}.0` : `v${major}.${minor + 1}`;
}

// ---------------------------------------------------------------------------
// Identity resolution
// ---------------------------------------------------------------------------

async function uniqueSlugFor(base: string, table: 'song' | 'artist'): Promise<string> {
  let candidate = base;
  let n = 1;
  // Bounded: a title colliding 50 times is a data problem, not a naming problem.
  while (n < 50) {
    const existing =
      table === 'song'
        ? await prisma.song.findUnique({ where: { slug: candidate }, select: { id: true } })
        : await prisma.artist.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export interface ResolvedArtist {
  id: string;
  displayName: string;
  slug: string;
  created: boolean;
  /** True when this artist already carries completed research we can reuse. */
  hasResearch: boolean;
}

/**
 * Finds an artist by normalized name (or alias), creating a stub when absent.
 * This is the reuse gate: 30 songs by one artist resolve to one artist row and
 * one piece of research, not 30.
 */
export async function findOrCreateArtist(displayNameRaw: string): Promise<ResolvedArtist> {
  const displayName = canonicalize(displayNameRaw);
  const normalized = normalizeArtist(displayName);

  if (!normalized) throw new Error('Artist name cannot be empty.');

  const existing = await prisma.artist.findFirst({
    where: { OR: [{ normalizedName: normalized }, { aliases: { has: normalized } }] },
    select: { id: true, displayName: true, slug: true, reviewStatus: true, overallScore: true },
  });

  if (existing) {
    return {
      id: existing.id,
      displayName: existing.displayName,
      slug: existing.slug,
      created: false,
      hasResearch: existing.reviewStatus === 'COMPLETED' && existing.overallScore !== null,
    };
  }

  const slug = await uniqueSlugFor(slugify(displayName), 'artist');
  const created = await prisma.artist.create({
    data: {
      displayName,
      canonicalName: displayName,
      normalizedName: normalized,
      slug,
    },
    select: { id: true, displayName: true, slug: true },
  });

  return { ...created, created: true, hasResearch: false };
}

export interface ResolvedSong {
  id: string;
  slug: string;
  displayTitle: string;
  artistId: string;
  created: boolean;
  /** True when a completed review already exists — callers must not re-review. */
  hasReview: boolean;
}

export async function findOrCreateSong(input: {
  title: string;
  artistId: string;
  artistName: string;
  album?: string | null;
  releaseYear?: number | null;
  genre?: string | null;
}): Promise<ResolvedSong> {
  const displayTitle = canonicalize(input.title);
  const normalizedTitle = normalizeTitle(displayTitle);

  if (!normalizedTitle) throw new Error('Song title cannot be empty.');

  const existing = await prisma.song.findUnique({
    where: { song_identity: { artistId: input.artistId, normalizedTitle } },
    select: { id: true, slug: true, displayTitle: true, artistId: true, reviewStatus: true, overallScore: true },
  });

  if (existing) {
    return {
      id: existing.id,
      slug: existing.slug,
      displayTitle: existing.displayTitle,
      artistId: existing.artistId,
      created: false,
      hasReview: existing.reviewStatus === 'COMPLETED' && existing.overallScore !== null,
    };
  }

  const slug = await uniqueSlugFor(songSlug(displayTitle, input.artistName), 'song');
  const created = await prisma.song.create({
    data: {
      displayTitle,
      canonicalTitle: displayTitle,
      normalizedTitle,
      slug,
      artistId: input.artistId,
      album: input.album ?? null,
      releaseYear: input.releaseYear ?? null,
      genre: input.genre ?? null,
    },
    select: { id: true, slug: true, displayTitle: true, artistId: true },
  });

  return { ...created, created: true, hasReview: false };
}

/** Looks up an existing completed review without creating anything. */
export async function findExistingReview(title: string, artistName?: string | null) {
  const normalizedTitle = normalizeTitle(title);
  if (!normalizedTitle) return null;

  const where: Prisma.SongWhereInput = { normalizedTitle };
  if (artistName) {
    const normalizedArtist = normalizeArtist(artistName);
    if (normalizedArtist) {
      where.artist = { OR: [{ normalizedName: normalizedArtist }, { aliases: { has: normalizedArtist } }] };
    }
  }

  return prisma.song.findFirst({
    where,
    select: {
      id: true,
      slug: true,
      displayTitle: true,
      overallScore: true,
      reviewStatus: true,
      reviewedAt: true,
      reviewVersion: true,
      recommendation: true,
      artist: { select: { displayName: true, slug: true } },
    },
    orderBy: { reviewedAt: 'desc' },
  });
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export async function upsertSource(input: {
  url: string;
  title: string;
  publisher?: string | null;
  author?: string | null;
  publicationDate?: string | null;
  sourceType: Prisma.SourceCreateInput['sourceType'];
  credibilityTier: Prisma.SourceCreateInput['credibilityTier'];
  summary?: string | null;
}): Promise<string> {
  const url = input.url.trim();
  const publicationDate = parseLooseDate(input.publicationDate);

  const source = await prisma.source.upsert({
    where: { url },
    create: {
      url,
      title: input.title.slice(0, 400),
      publisher: input.publisher ?? null,
      author: input.author ?? null,
      publicationDate,
      sourceType: input.sourceType,
      credibilityTier: input.credibilityTier,
      summary: input.summary ?? null,
      accessedAt: new Date(),
    },
    update: {
      title: input.title.slice(0, 400),
      publisher: input.publisher ?? undefined,
      author: input.author ?? undefined,
      publicationDate: publicationDate ?? undefined,
      sourceType: input.sourceType,
      credibilityTier: input.credibilityTier,
      summary: input.summary ?? undefined,
      accessedAt: new Date(),
    },
    select: { id: true },
  });

  return source.id;
}

function parseLooseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  // Guard against models emitting implausible dates.
  const year = parsed.getUTCFullYear();
  if (year < 1400 || year > new Date().getUTCFullYear() + 1) return null;
  return parsed;
}

// ---------------------------------------------------------------------------
// Saving a song review
// ---------------------------------------------------------------------------

export async function saveSongReview(songId: string, result: SongReviewResult): Promise<void> {
  const existing = await prisma.song.findUniqueOrThrow({
    where: { id: songId },
    include: {
      findings: true,
      scriptures: true,
      themes: { include: { theme: true } },
      sources: { include: { source: true } },
    },
  });

  const reviewVersion = nextReviewVersion(existing.reviewVersion, existing.scoringVersion, existing.methodologyVersion);

  // Snapshot the outgoing review before anything is replaced.
  if (existing.reviewStatus === 'COMPLETED' && existing.reviewVersion) {
    await prisma.reviewHistory.create({
      data: {
        songId,
        reviewVersion: existing.reviewVersion,
        scoringVersion: existing.scoringVersion ?? 'unknown',
        methodologyVersion: existing.methodologyVersion ?? 'unknown',
        overallScore: existing.overallScore,
        changeNote: `Superseded by ${reviewVersion}.`,
        snapshot: {
          scores: {
            overall: existing.overallScore,
            theological: existing.theologicalScore,
            communal: existing.communalScore,
            clarity: existing.clarityScore,
          },
          recommendation: existing.recommendation,
          summary: existing.summary,
          reviewedAt: existing.reviewedAt?.toISOString() ?? null,
          findings: existing.findings.map((f) => ({
            type: f.type,
            component: f.component,
            severity: f.severity,
            centrality: f.centrality,
            recurring: f.recurring,
            category: f.category,
            title: f.title,
            explanation: f.explanation,
            lyricExcerpt: f.lyricExcerpt,
            scriptureReference: f.scriptureReference,
            scoreImpact: f.scoreImpact,
          })),
          scriptures: existing.scriptures.map((s) => ({ reference: s.reference, relevance: s.relevance })),
          themes: existing.themes.map((t) => t.theme.name),
          sources: existing.sources.map((s) => ({ url: s.source.url, title: s.source.title })),
        } satisfies Prisma.InputJsonValue,
      },
    });
  }

  const themeRecords = await resolveThemes(result.themes);
  const sourceIds = await persistCitations(result.citations);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // Findings, scriptures, themes and source links are fully replaced: they
    // describe *this* review, and the previous set is preserved in history.
    await tx.songFinding.deleteMany({ where: { songId } });
    await tx.songScripture.deleteMany({ where: { songId } });
    await tx.songTheme.deleteMany({ where: { songId } });
    await tx.songSource.deleteMany({ where: { songId } });

    await tx.song.update({
      where: { id: songId },
      data: {
        displayTitle: result.identification.title,
        canonicalTitle: result.identification.title,
        normalizedTitle: normalizeTitle(result.identification.title),
        album: result.identification.album ?? existing.album,
        releaseYear: result.identification.releaseYear ?? existing.releaseYear,
        genre: result.identification.genre ?? existing.genre,

        overallScore: result.scores.overallScore,
        theologicalScore: result.scores.theologicalScore,
        communalScore: result.scores.communalScore,
        clarityScore: result.scores.clarityScore,
        recommendation: result.scores.recommendation,
        summary: result.synthesis.summary,

        reviewStatus: 'COMPLETED',
        reviewVersion,
        scoringVersion: SCORING_VERSION,
        methodologyVersion: METHODOLOGY_VERSION,
        reviewedAt: now,
        lastReviewedAt: now,
        reviewError: null,
      },
    });

    if (result.findings.length > 0) {
      await tx.songFinding.createMany({
        data: result.findings.map((f) => ({
          songId,
          type: f.type,
          component: f.component,
          severity: f.severity,
          centrality: f.centrality,
          recurring: f.recurring,
          category: f.category,
          title: f.title,
          explanation: f.explanation,
          lyricExcerpt: f.lyricExcerpt,
          scriptureReference: f.scriptureReference,
          scriptureExcerpt: f.scriptureExcerpt,
          scriptureRationale: f.scriptureRationale,
          scoreImpact: f.scoreImpact,
        })),
      });
    }

    const scriptures = dedupeBy(result.synthesis.scriptureReferences, (s) => s.reference.trim().toLowerCase());
    if (scriptures.length > 0) {
      await tx.songScripture.createMany({
        data: scriptures.map((s, i) => ({
          songId,
          reference: s.reference.trim(),
          excerpt: s.excerpt ?? null,
          relevance: s.relevance,
          ordering: i,
        })),
      });
    }

    if (themeRecords.length > 0) {
      await tx.songTheme.createMany({
        data: themeRecords.map((t) => ({ songId, themeId: t.id })),
        skipDuplicates: true,
      });
    }

    if (sourceIds.length > 0) {
      await tx.songSource.createMany({
        data: sourceIds.map((sourceId) => ({ songId, sourceId, relevance: 'Consulted during review research.' })),
        skipDuplicates: true,
      });
    }
  });

  log.info(events.reviewCompleted, { songId, reviewVersion, overall: result.scores.overallScore });
}

// ---------------------------------------------------------------------------
// Saving artist research
// ---------------------------------------------------------------------------

export async function saveArtistResearch(artistId: string, result: ArtistResearchResult): Promise<void> {
  const existing = await prisma.artist.findUniqueOrThrow({
    where: { id: artistId },
    include: { findings: true, sources: { include: { source: true } } },
  });

  const reviewVersion = nextReviewVersion(existing.reviewVersion, existing.scoringVersion, existing.methodologyVersion);

  if (existing.reviewStatus === 'COMPLETED' && existing.reviewVersion) {
    await prisma.reviewHistory.create({
      data: {
        artistId,
        reviewVersion: existing.reviewVersion,
        scoringVersion: existing.scoringVersion ?? 'unknown',
        methodologyVersion: existing.methodologyVersion ?? 'unknown',
        overallScore: existing.overallScore,
        changeNote: `Superseded by ${reviewVersion}.`,
        snapshot: {
          scores: {
            overall: existing.overallScore,
            doctrine: existing.doctrineScore,
            affiliations: existing.affiliationScore,
            publicTeaching: existing.publicTeachingScore,
            ministryContext: existing.ministryContextScore,
          },
          recommendation: existing.recommendation,
          summary: existing.summary,
          evidenceCaveat: existing.evidenceCaveat,
          reviewedAt: existing.reviewedAt?.toISOString() ?? null,
          findings: existing.findings.map((f) => ({
            type: f.type,
            component: f.component,
            severity: f.severity,
            category: f.category,
            title: f.title,
            explanation: f.explanation,
            evidence: f.evidence,
            evidenceGrade: f.evidenceGrade,
            contested: f.contested,
            scoreImpact: f.scoreImpact,
          })),
          sources: existing.sources.map((s) => ({
            url: s.source.url,
            title: s.source.title,
            tier: s.source.credibilityTier,
          })),
        } satisfies Prisma.InputJsonValue,
      },
    });
  }

  // Persist every declared source first so findings can point at real rows.
  const sourceIdByIndex = new Map<number, string>();
  for (const [index, source] of result.research.sources.entries()) {
    try {
      const id = await upsertSource({
        url: source.url,
        title: source.title,
        publisher: source.publisher ?? null,
        author: source.author ?? null,
        publicationDate: source.publicationDate ?? null,
        sourceType: source.sourceType,
        credibilityTier: source.credibilityTier,
        summary: source.summary ?? null,
      });
      sourceIdByIndex.set(index, id);
    } catch (error) {
      log.warn('source.persist_failed', { url: source.url, error });
    }
  }

  // Pages the model actually read but did not formally declare still belong on
  // the record — transparency over tidiness. Declared sources take precedence,
  // so anything already upserted above is skipped by URL.
  const declaredUrls = new Set(result.research.sources.map((s) => s.url.trim()));
  const extraSourceIds = await persistCitations(result.citations.filter((url) => !declaredUrls.has(url.trim())));

  const now = new Date();
  const aliases = [...new Set(result.research.aliases.map(normalizeArtist).filter(Boolean))];

  await prisma.$transaction(async (tx) => {
    await tx.artistFinding.deleteMany({ where: { artistId } });
    await tx.artistSource.deleteMany({ where: { artistId } });

    await tx.artist.update({
      where: { id: artistId },
      data: {
        type: result.research.artistType,
        aliases,
        country: result.research.country ?? existing.country,
        foundedYear: result.research.foundedYear ?? existing.foundedYear,
        websiteUrl: result.research.websiteUrl ?? existing.websiteUrl,
        bio: result.research.bio ?? existing.bio,

        overallScore: result.scores.overallScore,
        doctrineScore: result.scores.doctrineScore,
        affiliationScore: result.scores.affiliationScore,
        publicTeachingScore: result.scores.publicTeachingScore,
        ministryContextScore: result.scores.ministryContextScore,
        recommendation: result.scores.recommendation,
        summary: result.research.summary,
        evidenceCaveat: result.research.evidenceCaveat ?? null,

        reviewStatus: 'COMPLETED',
        reviewVersion,
        scoringVersion: SCORING_VERSION,
        methodologyVersion: METHODOLOGY_VERSION,
        reviewedAt: now,
        lastReviewedAt: now,
        reviewError: null,
      },
    });

    for (const finding of result.findings) {
      await tx.artistFinding.create({
        data: {
          artistId,
          type: finding.type,
          component: finding.component,
          severity: finding.severity,
          category: finding.category,
          title: finding.title,
          explanation: finding.explanation,
          evidence: finding.evidence,
          evidenceGrade: finding.evidenceGrade,
          contested: finding.contested,
          scoreImpact: finding.scoreImpact,
          sourceId: finding.sourceIndex !== null ? (sourceIdByIndex.get(finding.sourceIndex) ?? null) : null,
        },
      });
    }

    const linkIds = new Set([...sourceIdByIndex.values(), ...extraSourceIds]);

    if (linkIds.size > 0) {
      await tx.artistSource.createMany({
        data: [...linkIds].map((sourceId) => ({ artistId, sourceId })),
        skipDuplicates: true,
      });
    }
  });

  log.info(events.artistResearchCompleted, { artistId, reviewVersion, overall: result.scores.overallScore });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveThemes(names: string[]): Promise<Array<{ id: string }>> {
  if (names.length === 0) return [];
  const themes = await prisma.theme.findMany({
    where: { name: { in: names } },
    select: { id: true },
  });
  return themes;
}

/**
 * Turns raw citation URLs into Source rows. These are recorded at TIER_3 by
 * default — anything more confident must come from the model's declared
 * source list, where it states the tier explicitly.
 */
async function persistCitations(urls: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const url of urls.slice(0, 25)) {
    try {
      const parsed = new URL(url);
      const id = await upsertSource({
        url,
        title: parsed.hostname.replace(/^www\./, '') + parsed.pathname.slice(0, 80),
        publisher: parsed.hostname.replace(/^www\./, ''),
        sourceType: 'OTHER',
        credibilityTier: 'TIER_3',
        summary: 'Consulted while researching this song.',
      });
      ids.push(id);
    } catch {
      // A malformed citation URL is not worth failing a completed review over.
    }
  }
  return ids;
}

function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}
