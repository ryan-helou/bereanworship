import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SearchBar } from '@/components/search-bar';
import { env } from '@/lib/env';
import { hasSiteAccess } from '@/lib/site-access';
import { songIdsByVerdict, songVerdicts, VERDICT_FILTERS, type VerdictFilter } from '@/lib/notes';
import { SongCard, SongCardSkeleton } from '@/components/cards';
import { FilterBar } from '@/components/filters';
import { Pagination } from '@/components/pagination';
import { ButtonLink, EmptyState } from '@/components/ui';
import { DEFAULT_PER_PAGE, listGenres, listThemesWithCounts, searchSongs, type SongSort } from '@/lib/search';
import type { Recommendation } from '@prisma/client';

export const metadata: Metadata = {
  title: 'Songs',
  description:
    'Browse and search every worship song reviewed by BereanWorship — scored for biblical soundness, congregational suitability and clarity.',
  alternates: { canonical: '/songs' },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const SORT_OPTIONS = [
  { value: 'score_desc', label: 'Highest score' },
  { value: 'score_asc', label: 'Lowest score' },
  { value: 'title_asc', label: 'Title A–Z' },
  { value: 'title_desc', label: 'Title Z–A' },
  { value: 'newest', label: 'Newest reviewed' },
  { value: 'oldest', label: 'Oldest reviewed' },
  { value: 'range_easiest', label: 'Easiest to sing' },
];

const VALID_SORTS = new Set(['relevance', ...SORT_OPTIONS.map((o) => o.value)]);
const VALID_RECOMMENDATIONS = new Set(['RECOMMENDED', 'RECOMMENDED_WITH_CAUTION', 'NOT_RECOMMENDED']);

export default async function SongsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = normalize(await searchParams);
  const query = params.q ?? '';

  return (
    <>
      <header className="band-dark border-b-4 border-volt-500">
        <div className="container-page py-14 lg:py-20">
          <div className="max-w-3xl">
            <div className="eyebrow">Database</div>
            <h1 className="text-display mt-5 text-bone-100">Songs</h1>
            <p className="mt-6 max-w-2xl font-serif text-xl leading-relaxed text-indigo-200">
              Every song here has completed the review pipeline. Scores combine biblical soundness (60%),
              congregational suitability (20%) and clarity (20%).
            </p>
          </div>

          <div className="mt-10 max-w-2xl">
            <SearchBar initialQuery={query} placeholder="Search by song, artist, album, genre or theme…" onDark />
          </div>
        </div>
      </header>

      <section className="band-bone">
        <div className="container-page py-12">
          <Suspense fallback={null}>
            <Filters />
          </Suspense>

          <Suspense key={JSON.stringify(params)} fallback={<ResultsSkeleton />}>
            <Results params={params} />
          </Suspense>
        </div>
      </section>
    </>
  );
}

async function Filters() {
  const [themes, genres] = await Promise.all([listThemesWithCounts(), listGenres()]);
  const showVerdict = env.siteGateEnabled && (await hasSiteAccess());

  return (
    <div>
      <FilterBar
        sortOptions={SORT_OPTIONS}
        themes={themes.map((t) => ({ value: t.slug, label: t.name, count: t.count }))}
        genres={genres.map((g) => ({ value: g, label: g }))}
        showVerdict={showVerdict}
      />
    </div>
  );
}

async function Results({ params }: { params: NormalizedParams }) {
  // Verdicts are private: the filter only applies behind the site password.
  const canSeeVerdicts = env.siteGateEnabled && (await hasSiteAccess());
  const onlyIds = canSeeVerdicts && params.verdict ? await songIdsByVerdict(params.verdict) : undefined;

  const result = await searchSongs({
    onlyIds,
    q: params.q,
    page: params.page,
    perPage: DEFAULT_PER_PAGE,
    sort: params.sort,
    recommendation: params.recommendation,
    theme: params.theme,
    genre: params.genre,
    minScore: params.minScore,
    maxScore: params.maxScore,
    minRange: params.minRange,
  });

  if (result.items.length === 0) {
    return (
      <div className="mt-10">
        <EmptyState
          title="No songs found."
          description={
            params.q
              ? `Nothing matches “${params.q}”. Try a different spelling, search by artist instead, or request this song for review.`
              : 'No songs match these filters. Try widening them.'
          }
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <ButtonLink href="/songs" variant="secondary">
                Clear search
              </ButtonLink>
              <ButtonLink
                href={params.q ? `/request?title=${encodeURIComponent(params.q)}` : '/request'}
                variant="brand"
              >
                Request a review
              </ButtonLink>
            </div>
          }
        />
      </div>
    );
  }

  // Verdicts are private: shown only behind the site password, never on an open site.
  const verdicts = env.siteGateEnabled && (await hasSiteAccess()) ? await songVerdicts(result.items) : new Map();

  return (
    <>
      <div className="mt-8 flex items-center justify-between border-b-4 border-ink-900 pb-4">
        <p className="text-lg font-bold text-ink-900 tnum">
          {result.total} {result.total === 1 ? 'song' : 'songs'}
          {params.q && (
            <>
              {' '}
              matching <span className="text-volt-600">“{params.q}”</span>
            </>
          )}
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {result.items.map((song) => (
          <SongCard key={song.id} song={song} verdict={verdicts.get(song.id) ?? null} />
        ))}
      </div>

      <div className="mt-12">
        <Pagination
          page={result.page}
          totalPages={result.totalPages}
          total={result.total}
          perPage={result.perPage}
          basePath="/songs"
          searchParams={params.raw}
        />
      </div>
    </>
  );
}

function ResultsSkeleton() {
  return (
    <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <SongCardSkeleton key={i} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Query-string parsing
// ---------------------------------------------------------------------------

interface NormalizedParams {
  q?: string;
  page: number;
  sort?: SongSort;
  recommendation?: Recommendation;
  theme?: string;
  genre?: string;
  minScore?: number;
  maxScore?: number;
  minRange?: number;
  verdict?: VerdictFilter;
  raw: Record<string, string | undefined>;
}

/** Validates every incoming parameter — nothing untrusted reaches the query. */
function normalize(input: Record<string, string | string[] | undefined>): NormalizedParams {
  const single = (key: string): string | undefined => {
    const value = input[key];
    const str = Array.isArray(value) ? value[0] : value;
    return str && str.trim() ? str.trim() : undefined;
  };

  const int = (key: string): number | undefined => {
    const raw = single(key);
    if (!raw) return undefined;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : undefined;
  };

  const sortRaw = single('sort');
  const recommendationRaw = single('recommendation');
  const pageRaw = Number.parseInt(single('page') ?? '1', 10);

  const raw: Record<string, string | undefined> = {};
  for (const key of ['q', 'sort', 'recommendation', 'theme', 'genre', 'minScore', 'maxScore', 'minRange', 'verdict']) {
    raw[key] = single(key);
  }

  return {
    q: single('q')?.slice(0, 120),
    page: Number.isFinite(pageRaw) ? Math.max(1, pageRaw) : 1,
    sort: sortRaw && VALID_SORTS.has(sortRaw) ? (sortRaw as SongSort) : undefined,
    recommendation:
      recommendationRaw && VALID_RECOMMENDATIONS.has(recommendationRaw)
        ? (recommendationRaw as Recommendation)
        : undefined,
    verdict: (VERDICT_FILTERS as readonly string[]).includes(single('verdict') ?? '')
      ? (single('verdict') as VerdictFilter)
      : undefined,
    theme: single('theme')?.slice(0, 60),
    genre: single('genre')?.slice(0, 60),
    minScore: int('minScore'),
    maxScore: int('maxScore'),
    minRange: int('minRange'),
    raw,
  };
}
