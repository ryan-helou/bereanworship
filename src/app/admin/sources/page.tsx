import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { formatDate, hostname, humanize } from '@/lib/utils';
import { Badge } from '@/components/ui';
import type { CredibilityTier, Prisma } from '@prisma/client';

export const metadata = { title: 'Sources' };

/**
 * Source inspection.
 *
 * Every research claim on the site traces back to a row here, so this page is
 * the audit surface: which sources exist, what tier they carry, and what they
 * are being used to support.
 */

const TIERS: CredibilityTier[] = ['TIER_1', 'TIER_2', 'TIER_3', 'TIER_4'];

const TIER_DESCRIPTION: Record<CredibilityTier, string> = {
  TIER_1: 'Primary — official sites, statements of faith, direct interviews, sermons, books.',
  TIER_2: 'Highly reputable secondary — theological organisations, academic work.',
  TIER_3: 'General journalism.',
  TIER_4: 'Blogs, forums, social media. Cannot independently establish a serious claim.',
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminSourcesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireSession('/admin/sources');

  const params = await searchParams;
  const first = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
  };

  const q = first('q')?.slice(0, 200);
  const tierRaw = first('tier');
  const tier = tierRaw && TIERS.includes(tierRaw as CredibilityTier) ? (tierRaw as CredibilityTier) : undefined;
  const pageRaw = Number.parseInt(first('page') ?? '1', 10);
  const page = Number.isFinite(pageRaw) ? Math.max(1, pageRaw) : 1;
  const perPage = 40;

  const where: Prisma.SourceWhereInput = {
    ...(tier ? { credibilityTier: tier } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { publisher: { contains: q, mode: 'insensitive' } },
            { url: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [sources, total, tierCounts] = await Promise.all([
    prisma.source.findMany({
      where,
      orderBy: [{ credibilityTier: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        _count: { select: { songLinks: true, artistLinks: true, artistFindings: true } },
        artistLinks: { take: 3, include: { artist: { select: { displayName: true, slug: true } } } },
      },
    }),
    prisma.source.count({ where }),
    prisma.source.groupBy({ by: ['credibilityTier'], _count: { _all: true } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const countOf = (t: CredibilityTier) => tierCounts.find((c) => c.credibilityTier === t)?._count._all ?? 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Sources</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-500">
          Every source recorded during research, with its credibility tier. Findings resting only on tier-4 evidence are
          capped at a moderate penalty and published as contested.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TIERS.map((t) => (
          <Link
            key={t}
            href={tier === t ? '/admin/sources' : `/admin/sources?tier=${t}`}
            className={`card-hover rounded-xl border p-4 ${
              tier === t ? 'border-brand-300 bg-brand-50' : 'border-line bg-surface-0'
            }`}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-ink-900">{t.replace('_', ' ')}</span>
              <span className="tnum text-lg font-semibold text-ink-800">{countOf(t)}</span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-500">{TIER_DESCRIPTION[t]}</p>
          </Link>
        ))}
      </div>

      <form method="get" className="flex flex-wrap items-center gap-3">
        {tier && <input type="hidden" name="tier" value={tier} />}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search title, publisher or URL…"
          className="h-9 w-72 rounded-lg border border-line bg-surface-0 px-3 text-sm text-ink-900 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
        />
        <button
          type="submit"
          className="h-9 rounded-lg bg-ink-900 px-3.5 text-sm font-medium text-white transition-colors hover:bg-ink-800"
        >
          Search
        </button>
      </form>

      {sources.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong bg-surface-0 px-5 py-12 text-center text-sm text-ink-500">
          No sources recorded yet. They accumulate as research jobs complete.
        </p>
      ) : (
        <div className="space-y-3">
          {sources.map((source) => (
            <div key={source.id} className="rounded-xl border border-line bg-surface-0 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-sm font-medium text-brand-700 hover:underline"
                  >
                    {source.title}
                  </a>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink-400">
                    <span>{source.publisher ?? hostname(source.url)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{humanize(source.sourceType)}</span>
                    {source.publicationDate && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Published {formatDate(source.publicationDate)}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span>Accessed {formatDate(source.accessedAt)}</span>
                  </div>
                  {source.summary && (
                    <p className="mt-2 max-w-2xl text-xs leading-relaxed text-ink-500">{source.summary}</p>
                  )}
                  {source.artistLinks.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-ink-400">Used for</span>
                      {source.artistLinks.map(({ artist }) => (
                        <Link
                          key={artist.slug}
                          href={`/artists/${artist.slug}`}
                          className="text-brand-700 hover:underline"
                        >
                          {artist.displayName}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <Badge tone={source.credibilityTier === 'TIER_4' ? 'warn' : 'muted'}>
                    {source.credibilityTier.replace('_', ' ')}
                  </Badge>
                  <span className="tnum text-xs text-ink-400">
                    {source._count.artistFindings} findings · {source._count.songLinks + source._count.artistLinks}{' '}
                    links
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between">
          <p className="text-sm text-ink-400 tnum">
            Page {page} of {totalPages} · {total} sources
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/admin/sources?${new URLSearchParams({ ...(q ? { q } : {}), ...(tier ? { tier } : {}), page: String(page - 1) })}`}
                className="inline-flex h-9 items-center rounded-lg bg-surface-0 px-3 text-sm text-ink-700 ring-1 ring-inset ring-line hover:bg-surface-100"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/admin/sources?${new URLSearchParams({ ...(q ? { q } : {}), ...(tier ? { tier } : {}), page: String(page + 1) })}`}
                className="inline-flex h-9 items-center rounded-lg bg-surface-0 px-3 text-sm text-ink-700 ring-1 ring-inset ring-line hover:bg-surface-100"
              >
                Next
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
