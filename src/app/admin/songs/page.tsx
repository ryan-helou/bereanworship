import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { normalizeTitle } from '@/lib/normalize';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui';
import { flagSongAction, rereviewSongAction } from '../actions';
import type { Prisma, ReviewStatus } from '@prisma/client';

export const metadata = { title: 'Songs' };

/**
 * Admin song index.
 *
 * Unlike the public list, this shows every song regardless of review status —
 * including failures and songs flagged for a human look.
 */

const VALID_STATUSES: ReviewStatus[] = [
  'UNREVIEWED',
  'QUEUED',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'NEEDS_ATTENTION',
];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminSongsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireSession('/admin/songs');

  const params = await searchParams;
  const first = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
  };

  const q = first('q')?.slice(0, 120);
  const statusRaw = first('status');
  const status = statusRaw && VALID_STATUSES.includes(statusRaw as ReviewStatus) ? (statusRaw as ReviewStatus) : undefined;
  const flaggedOnly = first('flagged') === 'true';
  const pageRaw = Number.parseInt(first('page') ?? '1', 10);
  const page = Number.isFinite(pageRaw) ? Math.max(1, pageRaw) : 1;
  const perPage = 50;

  const where: Prisma.SongWhereInput = {
    ...(status ? { reviewStatus: status } : {}),
    ...(flaggedOnly ? { needsAttention: true } : {}),
    ...(q
      ? {
          OR: [
            { normalizedTitle: { contains: normalizeTitle(q) } },
            { displayTitle: { contains: q, mode: 'insensitive' } },
            { artist: { displayName: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [songs, total, flaggedCount] = await Promise.all([
    prisma.song.findMany({
      where,
      orderBy: [{ needsAttention: 'desc' }, { updatedAt: 'desc' }],
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        artist: { select: { displayName: true, slug: true } },
        _count: { select: { findings: true, sources: true, history: true } },
      },
    }),
    prisma.song.count({ where }),
    prisma.song.count({ where: { needsAttention: true } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Songs</h1>
        <p className="mt-1 text-sm text-ink-500">
          Every song in the database, including unreviewed and failed records. {total} shown.
        </p>
      </header>

      <form method="get" className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search title or artist…"
          className="h-9 w-64 rounded-lg border border-line bg-surface-0 px-3 text-sm text-ink-900 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
        />
        <select
          name="status"
          defaultValue={status ?? ''}
          className="h-9 cursor-pointer rounded-lg border border-line bg-surface-0 px-3 text-sm text-ink-600 focus:border-brand-400 focus:outline-none"
        >
          <option value="">Any status</option>
          {VALID_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ').toLowerCase()}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-9 rounded-lg bg-ink-900 px-3.5 text-sm font-medium text-white transition-colors hover:bg-ink-800"
        >
          Filter
        </button>
        {flaggedCount > 0 && (
          <Link
            href={flaggedOnly ? '/admin/songs' : '/admin/songs?flagged=true'}
            className={`inline-flex h-9 items-center rounded-lg px-3 text-sm transition-colors ${
              flaggedOnly
                ? 'bg-amber-100 font-medium text-amber-900'
                : 'bg-surface-0 text-ink-600 ring-1 ring-inset ring-line hover:bg-surface-100'
            }`}
          >
            Flagged ({flaggedCount})
          </Link>
        )}
      </form>

      {songs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong bg-surface-0 px-5 py-12 text-center text-sm text-ink-500">
          No songs match this filter.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface-0">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="border-b border-line bg-surface-50">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-left font-medium text-ink-500">
                  Song
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium text-ink-500">
                  Status
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium text-ink-500">
                  Score
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium text-ink-500">
                  Findings
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium text-ink-500">
                  Version
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium text-ink-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {songs.map((song) => (
                <tr key={song.id} className="align-top">
                  <td className="px-4 py-3">
                    <Link href={`/songs/${song.slug}`} className="font-medium text-brand-700 hover:underline">
                      {song.displayTitle}
                    </Link>
                    <div className="text-xs text-ink-400">{song.artist.displayName}</div>
                    {song.needsAttention && (
                      <div className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
                        {song.attentionNote ?? 'Flagged'}
                      </div>
                    )}
                    {song.reviewError && (
                      <div className="mt-1 max-w-md rounded bg-red-50 px-2 py-1 text-xs leading-relaxed text-red-800">
                        {song.reviewError.slice(0, 200)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={
                        song.reviewStatus === 'COMPLETED'
                          ? 'brand'
                          : song.reviewStatus === 'FAILED'
                            ? 'danger'
                            : song.reviewStatus === 'NEEDS_ATTENTION'
                              ? 'warn'
                              : 'muted'
                      }
                    >
                      {song.reviewStatus.replace(/_/g, ' ').toLowerCase()}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right tnum font-semibold text-ink-800">{song.overallScore ?? '—'}</td>
                  <td className="px-4 py-3 text-right tnum text-ink-500">{song._count.findings}</td>
                  <td className="px-4 py-3 text-ink-500">
                    <div>{song.reviewVersion ?? '—'}</div>
                    <div className="text-xs text-ink-400">{formatDate(song.reviewedAt)}</div>
                    {song._count.history > 0 && (
                      <div className="text-xs text-ink-400">{song._count.history} archived</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <form action={rereviewSongAction}>
                        <input type="hidden" name="songId" value={song.id} />
                        <button
                          type="submit"
                          className="rounded-lg bg-surface-100 px-2.5 py-1.5 text-xs font-medium text-ink-700 ring-1 ring-inset ring-line transition-colors hover:bg-surface-200"
                        >
                          Re-review
                        </button>
                      </form>
                      <form action={flagSongAction}>
                        <input type="hidden" name="songId" value={song.id} />
                        <input type="hidden" name="clear" value={song.needsAttention ? 'true' : 'false'} />
                        <button
                          type="submit"
                          className="rounded-lg px-2.5 py-1.5 text-xs text-ink-500 transition-colors hover:bg-surface-100 hover:text-ink-900"
                        >
                          {song.needsAttention ? 'Unflag' : 'Flag'}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
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
            {page > 1 && <PageLink page={page - 1} q={q} status={status} label="Previous" />}
            {page < totalPages && <PageLink page={page + 1} q={q} status={status} label="Next" />}
          </div>
        </nav>
      )}
    </div>
  );
}

function PageLink({ page, q, status, label }: { page: number; q?: string; status?: string; label: string }) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();

  return (
    <Link
      href={qs ? `/admin/songs?${qs}` : '/admin/songs'}
      className="inline-flex h-9 items-center rounded-lg bg-surface-0 px-3 text-sm text-ink-700 ring-1 ring-inset ring-line hover:bg-surface-100"
    >
      {label}
    </Link>
  );
}
