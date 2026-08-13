import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SearchBar } from '@/components/search-bar';
import { ArtistCard } from '@/components/cards';
import { Pagination } from '@/components/pagination';
import { ButtonLink, EmptyState } from '@/components/ui';
import { DEFAULT_PER_PAGE, searchArtists, type ArtistSort } from '@/lib/search';

export const metadata: Metadata = {
  title: 'Artists',
  description:
    'Artists, groups and ministries evaluated on their publicly documented theology — scored independently of the songs they write.',
  alternates: { canonical: '/artists' },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const SORT_OPTIONS: Array<{ value: ArtistSort; label: string }> = [
  { value: 'score_desc', label: 'Highest score' },
  { value: 'score_asc', label: 'Lowest score' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
  { value: 'songs_desc', label: 'Most reviewed songs' },
  { value: 'newest', label: 'Recently researched' },
];

const VALID_SORTS = new Set<string>(['relevance', ...SORT_OPTIONS.map((o) => o.value)]);

export default async function ArtistsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const single = (key: string) => {
    const value = raw[key];
    const str = Array.isArray(value) ? value[0] : value;
    return str?.trim() || undefined;
  };

  const q = single('q')?.slice(0, 120);
  const sortRaw = single('sort');
  const sort = sortRaw && VALID_SORTS.has(sortRaw) ? (sortRaw as ArtistSort) : undefined;
  const pageRaw = Number.parseInt(single('page') ?? '1', 10);
  const page = Number.isFinite(pageRaw) ? Math.max(1, pageRaw) : 1;

  return (
    <div className="container-page py-12 sm:py-16">
      <header className="max-w-3xl">
        <div className="eyebrow">Database</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Artists</h1>
        <p className="mt-3 text-[1.0625rem] leading-relaxed text-ink-500">
          Artists, groups and ministries assessed on their publicly documented beliefs, teaching, affiliations and
          ministry context.
        </p>
        <p className="mt-3 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm leading-relaxed text-brand-900">
          <span className="font-semibold">Artist validity is a separate rating.</span> It never affects the score of any
          song. A song is evaluated on its own words, whoever wrote it.
        </p>
      </header>

      <div className="mt-8 max-w-2xl">
        <SearchBar initialQuery={q ?? ''} action="/artists" placeholder="Search artists, groups and ministries…" />
      </div>

      <form method="get" className="mt-6 flex flex-wrap items-center gap-3">
        {q && <input type="hidden" name="q" value={q} />}
        <label htmlFor="artist-sort" className="text-sm text-ink-500">
          Sort
        </label>
        <select
          id="artist-sort"
          name="sort"
          defaultValue={sort ?? ''}
          className="h-9 cursor-pointer appearance-none rounded-lg border border-line bg-surface-0 py-0 pl-3 pr-8 text-sm text-ink-600 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
        >
          <option value="">Default</option>
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-9 rounded-lg bg-surface-100 px-3.5 text-sm font-medium text-ink-700 ring-1 ring-inset ring-line transition-colors hover:bg-surface-200"
        >
          Apply
        </button>
      </form>

      <Suspense key={`${q}-${sort}-${page}`} fallback={<Skeleton />}>
        <Results q={q} sort={sort} page={page} />
      </Suspense>
    </div>
  );
}

async function Results({ q, sort, page }: { q?: string; sort?: ArtistSort; page: number }) {
  const result = await searchArtists({ q, sort, page, perPage: DEFAULT_PER_PAGE });

  if (result.items.length === 0) {
    return (
      <div className="mt-10">
        <EmptyState
          title="No artists found."
          description={
            q
              ? `Nothing matches “${q}”. Try a different spelling, or search the song database instead.`
              : 'No artist research has been published yet.'
          }
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <ButtonLink href="/artists" variant="secondary">
                Clear search
              </ButtonLink>
              <ButtonLink href="/songs" variant="brand">
                Browse songs
              </ButtonLink>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <>
      <div className="mt-8 flex items-center justify-between border-b border-line pb-4">
        <p className="text-sm text-ink-500 tnum">
          {result.total} {result.total === 1 ? 'artist' : 'artists'}
          {q && (
            <>
              {' '}
              matching <span className="font-medium text-ink-800">“{q}”</span>
            </>
          )}
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {result.items.map((artist) => (
          <ArtistCard key={artist.id} artist={artist} />
        ))}
      </div>

      <div className="mt-10">
        <Pagination
          page={result.page}
          totalPages={result.totalPages}
          total={result.total}
          perPage={result.perPage}
          basePath="/artists"
          searchParams={{ q, sort }}
        />
      </div>
    </>
  );
}

function Skeleton() {
  return (
    <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="rounded-xl border border-line bg-surface-0 p-5">
          <div className="skeleton h-5 w-2/3 rounded" />
          <div className="skeleton mt-2 h-4 w-1/3 rounded" />
          <div className="skeleton mt-6 h-5 w-24 rounded-full" />
        </div>
      ))}
    </div>
  );
}
