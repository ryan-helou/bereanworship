import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { normalizeArtist } from '@/lib/normalize';
import { formatDate, relativeTime } from '@/lib/utils';
import { Badge } from '@/components/ui';
import { refreshArtistAction } from '../actions';
import type { Prisma } from '@prisma/client';

export const metadata = { title: 'Artists' };

/** Research goes stale; anything older than this is surfaced for a refresh. */
const STALE_AFTER_DAYS = 365;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminArtistsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireSession('/admin/artists');

  const params = await searchParams;
  const first = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
  };

  const q = first('q')?.slice(0, 120);
  const staleOnly = first('stale') === 'true';
  const pageRaw = Number.parseInt(first('page') ?? '1', 10);
  const page = Number.isFinite(pageRaw) ? Math.max(1, pageRaw) : 1;
  const perPage = 50;

  const staleCutoff = new Date(Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000);

  const where: Prisma.ArtistWhereInput = {
    ...(q
      ? {
          OR: [
            { normalizedName: { contains: normalizeArtist(q) } },
            { displayName: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
    ...(staleOnly
      ? { OR: [{ lastReviewedAt: { lt: staleCutoff } }, { lastReviewedAt: null }] }
      : {}),
  };

  const [artists, total, staleCount] = await Promise.all([
    prisma.artist.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        _count: { select: { songs: true, findings: true, sources: true } },
      },
    }),
    prisma.artist.count({ where }),
    prisma.artist.count({ where: { OR: [{ lastReviewedAt: { lt: staleCutoff } }, { lastReviewedAt: null }] } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Artists</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-500">
          Research is reused across every song by an artist, so it is produced once and refreshed deliberately.
          Refreshing archives the current version rather than overwriting it.
        </p>
      </header>

      <form method="get" className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search artists…"
          className="h-9 w-64 rounded-lg border border-line bg-bone-50 px-3 text-sm text-ink-900 focus:border-volt-400 focus:outline-none focus:ring-4 focus:ring-volt-100"
        />
        <button
          type="submit"
          className="h-9 rounded-lg bg-indigo-900 px-3.5 text-sm font-medium text-white transition-colors hover:bg-indigo-800"
        >
          Search
        </button>
        <Link
          href={staleOnly ? '/admin/artists' : '/admin/artists?stale=true'}
          className={`inline-flex h-9 items-center rounded-lg px-3 text-sm transition-colors ${
            staleOnly
              ? 'bg-ochre-100 font-medium text-ochre-900'
              : 'bg-bone-50 text-ink-600 ring-1 ring-inset ring-line hover:bg-bone-200'
          }`}
        >
          Stale or unresearched ({staleCount})
        </Link>
      </form>

      {artists.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong bg-bone-50 px-5 py-12 text-center text-sm text-ink-500">
          No artists match this filter.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-bone-50">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="border-b border-line bg-bone-50">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-left font-medium text-ink-500">
                  Artist
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium text-ink-500">
                  Status
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium text-ink-500">
                  Score
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium text-ink-500">
                  Songs
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium text-ink-500">
                  Sources
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium text-ink-500">
                  Researched
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium text-ink-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {artists.map((artist) => {
                const stale = !artist.lastReviewedAt || artist.lastReviewedAt < staleCutoff;

                return (
                  <tr key={artist.id} className="align-top">
                    <td className="px-4 py-3">
                      <Link href={`/artists/${artist.slug}`} className="font-medium text-volt-700 hover:underline">
                        {artist.displayName}
                      </Link>
                      <div className="text-xs text-ink-400">{artist.type.toLowerCase()}</div>
                      {artist.reviewError && (
                        <div className="mt-1 max-w-md rounded bg-flare-50 px-2 py-1 text-xs leading-relaxed text-flare-800">
                          {artist.reviewError.slice(0, 200)}
                        </div>
                      )}
                      {artist.evidenceCaveat && (
                        <div className="mt-1 max-w-md rounded bg-ochre-50 px-2 py-1 text-xs leading-relaxed text-ochre-900">
                          Contested evidence recorded
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          artist.reviewStatus === 'COMPLETED'
                            ? 'brand'
                            : artist.reviewStatus === 'FAILED'
                              ? 'danger'
                              : 'muted'
                        }
                      >
                        {artist.reviewStatus.replace(/_/g, ' ').toLowerCase()}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right tnum font-semibold text-ink-800">
                      {artist.overallScore ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right tnum text-ink-500">{artist._count.songs}</td>
                    <td className="px-4 py-3 text-right tnum text-ink-500">{artist._count.sources}</td>
                    <td className="px-4 py-3 text-ink-500">
                      <div>{formatDate(artist.lastReviewedAt)}</div>
                      {artist.lastReviewedAt && (
                        <div className={`text-xs ${stale ? 'text-ochre-700' : 'text-ink-400'}`}>
                          {stale ? 'Stale' : relativeTime(artist.lastReviewedAt)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <form action={refreshArtistAction}>
                          <input type="hidden" name="artistId" value={artist.id} />
                          <button
                            type="submit"
                            className="rounded-lg bg-bone-200 px-2.5 py-1.5 text-xs font-medium text-ink-700 ring-1 ring-inset ring-line transition-colors hover:bg-bone-300"
                          >
                            {artist.reviewStatus === 'COMPLETED' ? 'Refresh research' : 'Research'}
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between">
          <p className="text-sm text-ink-400 tnum">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/admin/artists?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page - 1) })}`}
                className="inline-flex h-9 items-center rounded-lg bg-bone-50 px-3 text-sm text-ink-700 ring-1 ring-inset ring-line hover:bg-bone-200"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/admin/artists?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page + 1) })}`}
                className="inline-flex h-9 items-center rounded-lg bg-bone-50 px-3 text-sm text-ink-700 ring-1 ring-inset ring-line hover:bg-bone-200"
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
