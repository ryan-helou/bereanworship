import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { queueStats } from '@/lib/queue';
import { formatDateTime, relativeTime } from '@/lib/utils';
import { Badge } from '@/components/ui';
import { JobStatusBadge } from '../job-status';
import { cancelJobAction, retryAllFailedAction, retryJobAction } from '../actions';
import type { JobStatus } from '@prisma/client';

export const metadata = { title: 'Review queue' };

const VALID_STATUSES: JobStatus[] = [
  'PENDING',
  'RESEARCHING',
  'ANALYZING',
  'SCORING',
  'COMPLETED',
  'FAILED',
  'NEEDS_REVIEW',
  'CANCELLED',
];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminJobsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireSession('/admin/jobs');

  const params = await searchParams;
  const first = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
  };

  const statusRaw = first('status');
  const status = statusRaw && VALID_STATUSES.includes(statusRaw as JobStatus) ? (statusRaw as JobStatus) : undefined;
  const batch = first('batch');
  const pageRaw = Number.parseInt(first('page') ?? '1', 10);
  const page = Number.isFinite(pageRaw) ? Math.max(1, pageRaw) : 1;
  const perPage = 50;

  const where = { ...(status ? { status } : {}), ...(batch ? { batchId: batch } : {}) };

  const [jobs, total, stats, batchStats] = await Promise.all([
    prisma.reviewJob.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        song: { select: { slug: true, displayTitle: true, overallScore: true } },
        artist: { select: { slug: true, displayName: true, overallScore: true } },
      },
    }),
    prisma.reviewJob.count({ where }),
    queueStats(),
    batch ? queueStats(batch) : null,
  ]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const shown = batchStats ?? stats;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Review queue</h1>
          <p className="mt-1 text-sm text-ink-500">
            {batch ? 'Jobs from one import batch.' : 'All review and research jobs.'} Retries never create a duplicate
            review — a job whose song is already reviewed exits cleanly.
          </p>
        </div>

        {stats.failed + stats.needsReview > 0 && (
          <form action={retryAllFailedAction}>
            <button
              type="submit"
              className="inline-flex h-9 items-center rounded-lg bg-indigo-900 px-4 text-sm font-medium text-white transition-colors hover:bg-indigo-800"
            >
              Retry all {stats.failed + stats.needsReview} failed
            </button>
          </form>
        )}
      </header>

      {/* Progress summary — the brief's "23 completed / 12 researching / …" view. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Pending" value={shown.pending} />
        <Stat label="Active" value={shown.active} tone="brand" />
        <Stat label="Completed" value={shown.completed} tone="good" />
        <Stat label="Failed" value={shown.failed} tone={shown.failed > 0 ? 'danger' : 'neutral'} />
        <Stat label="Needs review" value={shown.needsReview} tone={shown.needsReview > 0 ? 'warn' : 'neutral'} />
        <Stat label="Cancelled" value={shown.cancelled} />
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Filter by status">
        <FilterLink label="All" href={batch ? `/admin/jobs?batch=${batch}` : '/admin/jobs'} active={!status} />
        {VALID_STATUSES.map((s) => (
          <FilterLink
            key={s}
            label={s.replace(/_/g, ' ').toLowerCase()}
            href={`/admin/jobs?status=${s}${batch ? `&batch=${batch}` : ''}`}
            active={status === s}
          />
        ))}
      </nav>

      {jobs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong bg-bone-50 px-5 py-12 text-center text-sm text-ink-500">
          No jobs match this filter.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-bone-50">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="border-b border-line bg-bone-50">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-left font-medium text-ink-500">
                  Subject
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium text-ink-500">
                  Type
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium text-ink-500">
                  Status
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium text-ink-500">
                  Attempts
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium text-ink-500">
                  Updated
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium text-ink-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {jobs.map((job) => {
                const payload = (job.payload ?? {}) as { title?: string; artistName?: string; artist?: string };
                const stageLog = Array.isArray(job.stageLog) ? (job.stageLog as Array<{ note?: string }>) : [];
                const lastNote = stageLog.at(-1)?.note;

                return (
                  <tr key={job.id} className="align-top">
                    <td className="px-4 py-3">
                      {job.song ? (
                        <Link href={`/songs/${job.song.slug}`} className="font-medium text-volt-700 hover:underline">
                          {job.song.displayTitle}
                        </Link>
                      ) : job.artist ? (
                        <Link href={`/artists/${job.artist.slug}`} className="font-medium text-volt-700 hover:underline">
                          {job.artist.displayName}
                        </Link>
                      ) : (
                        <span className="font-medium text-ink-800">
                          {payload.title ?? payload.artistName ?? '—'}
                        </span>
                      )}
                      {payload.artist && <div className="text-xs text-ink-400">{payload.artist}</div>}
                      {lastNote && <div className="mt-1 max-w-md text-xs text-ink-400">{lastNote}</div>}
                      {job.lastError && (
                        <div className="mt-1 max-w-md rounded bg-flare-50 px-2 py-1 text-xs leading-relaxed text-flare-800">
                          {job.lastError.slice(0, 240)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone="muted">{job.type.replace(/_/g, ' ').toLowerCase()}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <JobStatusBadge status={job.status} />
                    </td>
                    <td className="px-4 py-3 text-right tnum text-ink-500">
                      {job.attempts}/{job.maxAttempts}
                    </td>
                    <td className="px-4 py-3 text-right text-ink-400" title={formatDateTime(job.updatedAt)}>
                      {relativeTime(job.updatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {['FAILED', 'NEEDS_REVIEW', 'CANCELLED'].includes(job.status) && (
                          <form action={retryJobAction}>
                            <input type="hidden" name="jobId" value={job.id} />
                            <button
                              type="submit"
                              className="rounded-lg bg-indigo-900 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-800"
                            >
                              Retry
                            </button>
                          </form>
                        )}
                        {job.status === 'PENDING' && (
                          <form action={cancelJobAction}>
                            <input type="hidden" name="jobId" value={job.id} />
                            <button
                              type="submit"
                              className="rounded-lg px-2.5 py-1.5 text-xs text-ink-500 transition-colors hover:bg-bone-200 hover:text-ink-900"
                            >
                              Cancel
                            </button>
                          </form>
                        )}
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
            Page {page} of {totalPages} · {total} jobs
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildHref({ status, batch, page: page - 1 })}
                className="inline-flex h-9 items-center rounded-lg bg-bone-50 px-3 text-sm text-ink-700 ring-1 ring-inset ring-line hover:bg-bone-200"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildHref({ status, batch, page: page + 1 })}
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

function buildHref({ status, batch, page }: { status?: string; batch?: string; page: number }): string {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (batch) params.set('batch', batch);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/admin/jobs?${qs}` : '/admin/jobs';
}

function Stat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'brand' | 'good' | 'warn' | 'danger';
}) {
  const toneClass = {
    neutral: 'text-ink-900',
    brand: 'text-volt-700',
    good: 'text-volt-700',
    warn: 'text-ochre-700',
    danger: 'text-flare-700',
  }[tone];

  return (
    <div className="rounded-lg border border-line bg-bone-50 p-3">
      <div className="text-xs text-ink-500">{label}</div>
      <div className={`tnum mt-1 text-2xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function FilterLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`rounded-lg px-3 py-1.5 text-sm capitalize transition-colors ${
        active
          ? 'bg-indigo-900 font-medium text-white'
          : 'bg-bone-50 text-ink-600 ring-1 ring-inset ring-line hover:bg-bone-200'
      }`}
    >
      {label}
    </Link>
  );
}
