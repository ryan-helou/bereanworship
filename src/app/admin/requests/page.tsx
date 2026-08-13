import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { formatDateTime, relativeTime } from '@/lib/utils';
import { Badge } from '@/components/ui';
import { queueAllPendingRequestsAction, queueRequestAction, rejectRequestAction } from '../actions';
import type { RequestStatus } from '@prisma/client';

export const metadata = { title: 'Song requests' };

const STATUS_TONE: Record<RequestStatus, 'neutral' | 'brand' | 'warn' | 'danger' | 'muted'> = {
  PENDING: 'warn',
  QUEUED: 'brand',
  COMPLETED: 'neutral',
  ALREADY_REVIEWED: 'neutral',
  DUPLICATE: 'muted',
  REJECTED: 'danger',
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminRequestsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireSession('/admin/requests');

  const params = await searchParams;
  const statusRaw = Array.isArray(params.status) ? params.status[0] : params.status;
  const validStatuses = ['PENDING', 'QUEUED', 'COMPLETED', 'ALREADY_REVIEWED', 'REJECTED'];
  const status = statusRaw && validStatuses.includes(statusRaw) ? (statusRaw as RequestStatus) : undefined;

  const [requests, counts] = await Promise.all([
    prisma.songRequest.findMany({
      where: status ? { status } : undefined,
      // Most-requested first: popular demand is the best queue ordering signal.
      orderBy: [{ status: 'asc' }, { requestCount: 'desc' }, { createdAt: 'asc' }],
      take: 200,
      include: { song: { select: { slug: true, displayTitle: true, overallScore: true } } },
    }),
    prisma.songRequest.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const countOf = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const pendingCount = countOf('PENDING');

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Song requests</h1>
          <p className="mt-1 text-sm text-ink-500">
            Public submissions. Queueing a request creates a review job; duplicates were already folded together on
            submission.
          </p>
        </div>

        {pendingCount > 0 && (
          <form action={queueAllPendingRequestsAction}>
            <button
              type="submit"
              className="inline-flex h-9 items-center rounded-lg bg-brand-700 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-800"
            >
              Queue all {pendingCount} pending
            </button>
          </form>
        )}
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="Filter by status">
        <FilterLink label="All" href="/admin/requests" active={!status} count={requests.length} />
        {validStatuses.map((s) => (
          <FilterLink
            key={s}
            label={s.replace(/_/g, ' ').toLowerCase()}
            href={`/admin/requests?status=${s}`}
            active={status === s}
            count={countOf(s)}
          />
        ))}
      </nav>

      {requests.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong bg-surface-0 px-5 py-12 text-center text-sm text-ink-500">
          No requests {status ? `with status ${status.toLowerCase()}` : 'yet'}.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface-0">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-surface-50">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-left font-medium text-ink-500">
                  Song
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium text-ink-500">
                  Artist
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium text-ink-500">
                  Asks
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium text-ink-500">
                  Status
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium text-ink-500">
                  Submitted
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium text-ink-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {requests.map((request) => (
                <tr key={request.id} className="align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink-900">{request.rawTitle}</div>
                    {request.notes && (
                      <div className="mt-1 max-w-md text-xs leading-relaxed text-ink-500">{request.notes}</div>
                    )}
                    {request.song && (
                      <Link
                        href={`/songs/${request.song.slug}`}
                        className="mt-1 inline-block text-xs text-brand-700 hover:underline"
                      >
                        {request.song.displayTitle}
                        {request.song.overallScore !== null && ` — ${request.song.overallScore}/100`} →
                      </Link>
                    )}
                    {request.resolutionNote && (
                      <div className="mt-1 text-xs text-ink-400">{request.resolutionNote}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-600">{request.rawArtist ?? <span className="text-ink-300">—</span>}</td>
                  <td className="px-4 py-3 text-right tnum text-ink-600">{request.requestCount}</td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[request.status]}>{request.status.replace(/_/g, ' ').toLowerCase()}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right text-ink-400" title={formatDateTime(request.createdAt)}>
                    {relativeTime(request.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    {request.status === 'PENDING' && (
                      <div className="flex justify-end gap-2">
                        <form action={queueRequestAction}>
                          <input type="hidden" name="requestId" value={request.id} />
                          <button
                            type="submit"
                            className="rounded-lg bg-ink-900 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-ink-800"
                          >
                            Queue
                          </button>
                        </form>
                        <form action={rejectRequestAction}>
                          <input type="hidden" name="requestId" value={request.id} />
                          <button
                            type="submit"
                            className="rounded-lg px-2.5 py-1.5 text-xs text-ink-500 transition-colors hover:bg-surface-100 hover:text-ink-900"
                          >
                            Reject
                          </button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterLink({
  label,
  href,
  active,
  count,
}: {
  label: string;
  href: string;
  active: boolean;
  count: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm capitalize transition-colors ${
        active ? 'bg-ink-900 font-medium text-white' : 'bg-surface-0 text-ink-600 ring-1 ring-inset ring-line hover:bg-surface-100'
      }`}
    >
      {label}
      <span className="tnum text-xs opacity-70">{count}</span>
    </Link>
  );
}
