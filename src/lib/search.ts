import './server-guard';
import { Prisma } from '@prisma/client';
import { prisma } from './db';
import { normalizeArtist, normalizeTitle } from './normalize';
import type { Recommendation } from '@prisma/client';

/**
 * Public query layer: search, filter, sort, paginate.
 *
 * Search combines three mechanisms so that ordinary human queries work:
 *
 *   · full-text (tsvector)  — ranked whole-word matching, handles stemming
 *                             so "singing" finds "sing";
 *   · ILIKE substring       — partial words, so "amazing" finds "Amazing
 *                             Grace" and "tomlin" finds "Chris Tomlin";
 *   · trigram similarity    — typo tolerance, so "tomlim" still finds him.
 *
 * Matching runs over the song *and* its artist, which is why a raw query is
 * used here rather than the Prisma query builder: the ranking expression spans
 * the join and there is no way to express it otherwise. Every interpolation is
 * a bound parameter — Prisma's tagged template never concatenates values into
 * the SQL string.
 */

export type SongSort =
  | 'relevance'
  | 'score_desc'
  | 'score_asc'
  | 'title_asc'
  | 'title_desc'
  | 'newest'
  | 'oldest'
  | 'range_easiest';

export interface SongQuery {
  q?: string;
  page?: number;
  perPage?: number;
  sort?: SongSort;
  minScore?: number;
  maxScore?: number;
  recommendation?: Recommendation;
  artistSlug?: string;
  genre?: string;
  theme?: string;
  minTheological?: number;
  minCommunal?: number;
  minClarity?: number;
  /** Only songs whose measured range is at least this accessible. */
  minRange?: number;
}

export interface SongListItem {
  id: string;
  slug: string;
  displayTitle: string;
  album: string | null;
  releaseYear: number | null;
  genre: string | null;
  overallScore: number | null;
  theologicalScore: number | null;
  communalScore: number | null;
  clarityScore: number | null;
  recommendation: Recommendation | null;
  reviewedAt: Date | null;
  rangeScore: number | null;
  rangeLowest: string | null;
  rangeHighest: string | null;
  artist: { displayName: string; slug: string; overallScore: number | null };
  themes: string[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export const DEFAULT_PER_PAGE = 24;
const MAX_PER_PAGE = 60;

/** Only completed reviews are ever exposed publicly. */
const PUBLIC_SONG_FILTER = Prisma.sql`s."reviewStatus" = 'COMPLETED' AND s."overallScore" IS NOT NULL`;

export async function searchSongs(query: SongQuery): Promise<Paged<SongListItem>> {
  const page = Math.max(1, query.page ?? 1);
  const perPage = Math.min(MAX_PER_PAGE, Math.max(1, query.perPage ?? DEFAULT_PER_PAGE));
  const offset = (page - 1) * perPage;

  const term = (query.q ?? '').trim();
  const hasTerm = term.length > 0;
  const normTitle = normalizeTitle(term);
  const normArtist = normalizeArtist(term);
  const like = `%${term.toLowerCase()}%`;

  const conditions: Prisma.Sql[] = [PUBLIC_SONG_FILTER];

  if (hasTerm) {
    conditions.push(Prisma.sql`(
         s."searchVector" @@ websearch_to_tsquery('english', ${term})
      OR a."searchVector" @@ websearch_to_tsquery('english', ${term})
      OR lower(s."displayTitle") LIKE ${like}
      OR s."normalizedTitle" LIKE ${`%${normTitle}%`}
      OR lower(a."displayName") LIKE ${like}
      OR a."normalizedName" LIKE ${`%${normArtist}%`}
      OR lower(coalesce(s."album", '')) LIKE ${like}
      OR lower(coalesce(s."genre", '')) LIKE ${like}
      OR similarity(s."normalizedTitle", ${normTitle}) > 0.32
      OR similarity(a."normalizedName", ${normArtist}) > 0.32
      OR word_similarity(${normTitle}, s."normalizedTitle") > 0.45
      OR word_similarity(${normArtist}, a."normalizedName") > 0.45
      OR EXISTS (
           SELECT 1 FROM "song_themes" st
             JOIN "themes" t ON t."id" = st."themeId"
            WHERE st."songId" = s."id" AND lower(t."name") = ${term.toLowerCase()}
         )
    )`);
  }

  if (query.minScore !== undefined) conditions.push(Prisma.sql`s."overallScore" >= ${query.minScore}`);
  if (query.maxScore !== undefined) conditions.push(Prisma.sql`s."overallScore" <= ${query.maxScore}`);
  if (query.minTheological !== undefined) conditions.push(Prisma.sql`s."theologicalScore" >= ${query.minTheological}`);
  if (query.minCommunal !== undefined) conditions.push(Prisma.sql`s."communalScore" >= ${query.minCommunal}`);
  if (query.minClarity !== undefined) conditions.push(Prisma.sql`s."clarityScore" >= ${query.minClarity}`);
  // Only filters songs whose range was actually measured; an unmeasured song
  // is neither silently included nor silently excluded.
  if (query.minRange !== undefined) conditions.push(Prisma.sql`s."rangeScore" >= ${query.minRange}`);
  if (query.recommendation) {
    conditions.push(Prisma.sql`s."recommendation" = ${query.recommendation}::"Recommendation"`);
  }
  if (query.artistSlug) conditions.push(Prisma.sql`a."slug" = ${query.artistSlug}`);
  if (query.genre) conditions.push(Prisma.sql`s."genre" = ${query.genre}`);
  if (query.theme) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "song_themes" st
        JOIN "themes" t ON t."id" = st."themeId"
       WHERE st."songId" = s."id" AND t."slug" = ${query.theme}
    )`);
  }

  const where = Prisma.join(conditions, ' AND ');

  const rank = hasTerm
    ? Prisma.sql`GREATEST(
        ts_rank(s."searchVector", websearch_to_tsquery('english', ${term})) * 4.0,
        ts_rank(a."searchVector", websearch_to_tsquery('english', ${term})) * 2.0,
        similarity(s."normalizedTitle", ${normTitle}) * 3.0,
        similarity(a."normalizedName", ${normArtist}) * 2.0,
        word_similarity(${normTitle}, s."normalizedTitle") * 2.5,
        word_similarity(${normArtist}, a."normalizedName") * 1.8,
        CASE WHEN s."normalizedTitle" LIKE ${`${normTitle}%`} THEN 3.5 ELSE 0 END,
        CASE WHEN a."normalizedName" LIKE ${`${normArtist}%`} THEN 2.5 ELSE 0 END
      )`
    : Prisma.sql`0.0`;

  const sort = query.sort ?? (hasTerm ? 'relevance' : 'score_desc');
  const orderBy = orderClause(sort, hasTerm);

  const [rows, countRows] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string }>>`
      SELECT s."id", ${rank} AS rank
        FROM "songs" s
        JOIN "artists" a ON a."id" = s."artistId"
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT ${perPage} OFFSET ${offset}
    `,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
        FROM "songs" s
        JOIN "artists" a ON a."id" = s."artistId"
       WHERE ${where}
    `,
  ]);

  const total = Number(countRows[0]?.count ?? 0n);
  const items = await hydrateSongs(rows.map((r) => r.id));

  return { items, total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}

function orderClause(sort: SongSort, hasTerm: boolean): Prisma.Sql {
  switch (sort) {
    case 'score_desc':
      return Prisma.sql`s."overallScore" DESC NULLS LAST, s."displayTitle" ASC`;
    case 'score_asc':
      return Prisma.sql`s."overallScore" ASC NULLS LAST, s."displayTitle" ASC`;
    case 'title_asc':
      return Prisma.sql`s."displayTitle" ASC`;
    case 'title_desc':
      return Prisma.sql`s."displayTitle" DESC`;
    case 'newest':
      return Prisma.sql`s."reviewedAt" DESC NULLS LAST, s."displayTitle" ASC`;
    case 'oldest':
      return Prisma.sql`s."reviewedAt" ASC NULLS LAST, s."displayTitle" ASC`;
    case 'range_easiest':
      return Prisma.sql`s."rangeScore" DESC NULLS LAST, s."displayTitle" ASC`;
    case 'relevance':
    default:
      return hasTerm
        ? Prisma.sql`rank DESC, s."overallScore" DESC NULLS LAST, s."displayTitle" ASC`
        : Prisma.sql`s."overallScore" DESC NULLS LAST, s."displayTitle" ASC`;
  }
}

/** Fetches full records for a page of IDs, preserving the ranked order. */
async function hydrateSongs(ids: string[]): Promise<SongListItem[]> {
  if (ids.length === 0) return [];

  const songs = await prisma.song.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      slug: true,
      displayTitle: true,
      album: true,
      releaseYear: true,
      genre: true,
      overallScore: true,
      theologicalScore: true,
      communalScore: true,
      clarityScore: true,
      recommendation: true,
      reviewedAt: true,
      rangeScore: true,
      rangeLowest: true,
      rangeHighest: true,
      artist: { select: { displayName: true, slug: true, overallScore: true } },
      themes: { select: { theme: { select: { name: true } } } },
    },
  });

  const byId = new Map(songs.map((s) => [s.id, s]));
  return ids
    .map((id) => byId.get(id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
    .map((s) => ({
      id: s.id,
      slug: s.slug,
      displayTitle: s.displayTitle,
      album: s.album,
      releaseYear: s.releaseYear,
      genre: s.genre,
      overallScore: s.overallScore,
      theologicalScore: s.theologicalScore,
      communalScore: s.communalScore,
      clarityScore: s.clarityScore,
      recommendation: s.recommendation,
      reviewedAt: s.reviewedAt,
      rangeScore: s.rangeScore,
      rangeLowest: s.rangeLowest,
      rangeHighest: s.rangeHighest,
      artist: s.artist,
      themes: s.themes.map((t) => t.theme.name),
    }));
}

// ---------------------------------------------------------------------------
// Artists
// ---------------------------------------------------------------------------

export type ArtistSort = 'relevance' | 'score_desc' | 'score_asc' | 'name_asc' | 'name_desc' | 'songs_desc' | 'newest';

export interface ArtistQuery {
  q?: string;
  page?: number;
  perPage?: number;
  sort?: ArtistSort;
  minScore?: number;
  maxScore?: number;
}

export interface ArtistListItem {
  id: string;
  slug: string;
  displayName: string;
  type: string;
  overallScore: number | null;
  recommendation: Recommendation | null;
  reviewedAt: Date | null;
  songCount: number;
}

export async function searchArtists(query: ArtistQuery): Promise<Paged<ArtistListItem>> {
  const page = Math.max(1, query.page ?? 1);
  const perPage = Math.min(MAX_PER_PAGE, Math.max(1, query.perPage ?? DEFAULT_PER_PAGE));
  const offset = (page - 1) * perPage;

  const term = (query.q ?? '').trim();
  const hasTerm = term.length > 0;
  const norm = normalizeArtist(term);
  const like = `%${term.toLowerCase()}%`;

  // An artist is listed once research exists, or once they have a reviewed
  // song — a reviewed song with a hidden artist page would be a dead end.
  const conditions: Prisma.Sql[] = [
    Prisma.sql`(
      (a."reviewStatus" = 'COMPLETED' AND a."overallScore" IS NOT NULL)
      OR EXISTS (SELECT 1 FROM "songs" s2 WHERE s2."artistId" = a."id" AND s2."reviewStatus" = 'COMPLETED')
    )`,
  ];

  if (hasTerm) {
    conditions.push(Prisma.sql`(
         a."searchVector" @@ websearch_to_tsquery('english', ${term})
      OR lower(a."displayName") LIKE ${like}
      OR a."normalizedName" LIKE ${`%${norm}%`}
      OR similarity(a."normalizedName", ${norm}) > 0.32
      OR word_similarity(${norm}, a."normalizedName") > 0.45
      OR EXISTS (SELECT 1 FROM unnest(a."aliases") al WHERE al LIKE ${`%${norm}%`})
      OR EXISTS (
           SELECT 1 FROM "songs" s3
            WHERE s3."artistId" = a."id"
              AND s3."reviewStatus" = 'COMPLETED'
              AND lower(s3."displayTitle") LIKE ${like}
         )
    )`);
  }

  if (query.minScore !== undefined) conditions.push(Prisma.sql`a."overallScore" >= ${query.minScore}`);
  if (query.maxScore !== undefined) conditions.push(Prisma.sql`a."overallScore" <= ${query.maxScore}`);

  const where = Prisma.join(conditions, ' AND ');

  const rank = hasTerm
    ? Prisma.sql`GREATEST(
        ts_rank(a."searchVector", websearch_to_tsquery('english', ${term})) * 4.0,
        similarity(a."normalizedName", ${norm}) * 3.0,
        word_similarity(${norm}, a."normalizedName") * 2.5,
        CASE WHEN a."normalizedName" LIKE ${`${norm}%`} THEN 3.5 ELSE 0 END
      )`
    : Prisma.sql`0.0`;

  const orderBy = artistOrderClause(query.sort ?? (hasTerm ? 'relevance' : 'score_desc'), hasTerm);

  const [rows, countRows] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string; song_count: bigint }>>`
      SELECT a."id",
             ${rank} AS rank,
             (SELECT COUNT(*) FROM "songs" s4
               WHERE s4."artistId" = a."id" AND s4."reviewStatus" = 'COMPLETED')::bigint AS song_count
        FROM "artists" a
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT ${perPage} OFFSET ${offset}
    `,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM "artists" a WHERE ${where}
    `,
  ]);

  const total = Number(countRows[0]?.count ?? 0n);
  if (rows.length === 0) {
    return { items: [], total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)) };
  }

  const artists = await prisma.artist.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
    select: {
      id: true,
      slug: true,
      displayName: true,
      type: true,
      overallScore: true,
      recommendation: true,
      reviewedAt: true,
    },
  });

  const byId = new Map(artists.map((a) => [a.id, a]));
  const items: ArtistListItem[] = [];
  for (const row of rows) {
    const artist = byId.get(row.id);
    if (!artist) continue;
    items.push({ ...artist, songCount: Number(row.song_count) });
  }

  return { items, total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}

function artistOrderClause(sort: ArtistSort, hasTerm: boolean): Prisma.Sql {
  switch (sort) {
    case 'score_desc':
      return Prisma.sql`a."overallScore" DESC NULLS LAST, a."displayName" ASC`;
    case 'score_asc':
      return Prisma.sql`a."overallScore" ASC NULLS LAST, a."displayName" ASC`;
    case 'name_asc':
      return Prisma.sql`a."displayName" ASC`;
    case 'name_desc':
      return Prisma.sql`a."displayName" DESC`;
    case 'songs_desc':
      return Prisma.sql`song_count DESC, a."displayName" ASC`;
    case 'newest':
      return Prisma.sql`a."reviewedAt" DESC NULLS LAST, a."displayName" ASC`;
    case 'relevance':
    default:
      return hasTerm
        ? Prisma.sql`rank DESC, a."overallScore" DESC NULLS LAST, a."displayName" ASC`
        : Prisma.sql`a."overallScore" DESC NULLS LAST, a."displayName" ASC`;
  }
}

// ---------------------------------------------------------------------------
// Lightweight suggestions for the search box
// ---------------------------------------------------------------------------

export interface Suggestion {
  type: 'song' | 'artist';
  label: string;
  sublabel: string | null;
  href: string;
  score: number | null;
}

export async function suggest(term: string, limit = 8): Promise<Suggestion[]> {
  const trimmed = term.trim();
  if (trimmed.length < 2) return [];

  const [songs, artists] = await Promise.all([
    searchSongs({ q: trimmed, perPage: limit, sort: 'relevance' }),
    searchArtists({ q: trimmed, perPage: Math.ceil(limit / 2), sort: 'relevance' }),
  ]);

  const out: Suggestion[] = [
    ...artists.items.map((a) => ({
      type: 'artist' as const,
      label: a.displayName,
      sublabel: `${a.songCount} reviewed ${a.songCount === 1 ? 'song' : 'songs'}`,
      href: `/artists/${a.slug}`,
      score: a.overallScore,
    })),
    ...songs.items.map((s) => ({
      type: 'song' as const,
      label: s.displayTitle,
      sublabel: s.artist.displayName,
      href: `/songs/${s.slug}`,
      score: s.overallScore,
    })),
  ];

  return out.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Filter option sources
// ---------------------------------------------------------------------------

export async function listThemesWithCounts() {
  const themes = await prisma.theme.findMany({
    orderBy: [{ ordering: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      slug: true,
      _count: { select: { songs: true } },
    },
  });
  return themes
    .map((t) => ({ id: t.id, name: t.name, slug: t.slug, count: t._count.songs }))
    .filter((t) => t.count > 0);
}

export async function listGenres(): Promise<string[]> {
  const rows = await prisma.song.findMany({
    where: { reviewStatus: 'COMPLETED', genre: { not: null } },
    select: { genre: true },
    distinct: ['genre'],
    orderBy: { genre: 'asc' },
  });
  return rows.map((r) => r.genre).filter((g): g is string => Boolean(g));
}
