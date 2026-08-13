import Link from 'next/link';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { requireSession } from '@/lib/auth';
import { queueStats } from '@/lib/queue';
import { formatDateTime, relativeTime } from '@/lib/utils';
import { Badge, ButtonLink } from '@/components/ui';
import { JobStatusBadge } from './job-status';

export const metadata = { title: 'Dashboard' };

/**
 * Admin dashboard.
 *
 * Answers, in order: is the system healthy, what needs my attention, and what
 * has been happening. Metrics first, then the things that are stuck.
 */

export default async function AdminDashboard() {
  await requireSession('/admin');

  const [
    songsReviewed,
    songsTotal,
    artistsReviewed,
    artistsTotal,
    pendingRequests,
    stats,
    avgSong,
    avgArtist,
    recentJobs,
    flagged,
    recentBatches,
  ] = await Promise.all([
    prisma.song.count({ where: { reviewStatus: 'COMPLETED' } }),
    prisma.song.count(),
    prisma.artist.count({ where: { reviewStatus: 'COMPLETED' } }),
    prisma.artist.count(),
    prisma.songRequest.count({ where: { status: 'PENDING' } }),
    queueStats(),
    prisma.song.aggregate({ where: { reviewStatus: 'COMPLETED' }, _avg: { overallScore: true } }),
    prisma.artist.aggregate({ where: { reviewStatus: 'COMPLETED' }, _avg: { overallScore: true } }),
    prisma.reviewJob.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 12,
      include: {
        song: { select: { displayTitle: true, slug: true } },
        artist: { select: { displayName: true, slug: true } },
      },
    }),
    prisma.song.count({ where: { needsAttention: true } }),
    prisma.importBatch.findMany({ orderBy: { createdAt: 'desc' }, take: 3 }),
  ]);

  const needsAttention = stats.failed + stats.needsReview + flagged;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-500">Review pipeline status and database health.</p>
        </div>
        <div className="flex gap-3">
          <ButtonLink href="/admin/import" variant="brand" size="sm">
            Bulk import
          </ButtonLink>
          <ButtonLink href="/admin/requests" variant="secondary" size="sm">
            Requests {pendingRequests > 0 && `(${pendingRequests})`}
          </ButtonLink>
        </div>
      </header>

      {!env.aiConfigured && (
        <div className="rounded-xl border border-line bg-bone-50 p-5">
          <h2 className="text-sm font-semibold text-ink-900">Automated reviews are turned off</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-600">
            <code className="rounded bg-bone-200 px-1 py-0.5 font-mono text-xs">ANTHROPIC_API_KEY</code> is not set,
            so the worker cannot run reviews and anything queued will fail. This is a valid way to operate: publish
            reviews from{' '}
            <Link href="/admin/review" className="font-medium text-volt-700 underline-offset-2 hover:underline">
              Publish a review
            </Link>{' '}
            instead, which uses the same schemas, the same scoring engine and the same versioned storage. Set the key on
            the worker to turn the automated pipeline back on.
          </p>
        </div>
      )}

      {needsAttention > 0 && (
        <div className="rounded-xl border border-flare-200 bg-flare-50 p-5">
          <h2 className="text-sm font-semibold text-flare-900">{needsAttention} items need attention</h2>
          <p className="mt-2 text-sm text-flare-900">
            {stats.failed > 0 && `${stats.failed} failed jobs. `}
            {stats.needsReview > 0 && `${stats.needsReview} jobs need manual review. `}
            {flagged > 0 && `${flagged} songs flagged.`}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/admin/jobs?status=FAILED"
              className="inline-flex h-8 items-center rounded-lg bg-flare-600 px-3 text-sm font-medium text-white transition-colors hover:bg-flare-700"
            >
              Review failures
            </Link>
          </div>
        </div>
      )}

      {/* --- Metrics ---------------------------------------------------- */}
      <section>
        <h2 className="eyebrow mb-4">Database</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Songs reviewed" value={songsReviewed} sub={`${songsTotal} total in database`} />
          <Metric label="Artists reviewed" value={artistsReviewed} sub={`${artistsTotal} total in database`} />
          <Metric
            label="Average song score"
            value={avgSong._avg.overallScore !== null ? Math.round(avgSong._avg.overallScore) : '—'}
            sub="Across completed reviews"
          />
          <Metric
            label="Average artist score"
            value={avgArtist._avg.overallScore !== null ? Math.round(avgArtist._avg.overallScore) : '—'}
            sub="Across completed research"
          />
        </div>
      </section>

      <section>
        <h2 className="eyebrow mb-4">Queue</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Pending" value={stats.pending} href="/admin/jobs?status=PENDING" />
          <Metric label="Active" value={stats.active} href="/admin/jobs" />
          <Metric label="Completed" value={stats.completed} href="/admin/jobs?status=COMPLETED" />
          <Metric label="Failed" value={stats.failed} tone={stats.failed > 0 ? 'danger' : 'neutral'} href="/admin/jobs?status=FAILED" />
          <Metric
            label="Needs review"
            value={stats.needsReview}
            tone={stats.needsReview > 0 ? 'warn' : 'neutral'}
            href="/admin/jobs?status=NEEDS_REVIEW"
          />
        </div>
        <p className="mt-3 text-xs text-ink-400">
          Pending requests: <span className="tnum font-medium text-ink-600">{pendingRequests}</span>
        </p>
      </section>

      {/* --- Recent activity --------------------------------------------- */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="eyebrow">Recent activity</h2>
          <Link href="/admin/jobs" className="text-sm text-volt-700 hover:underline">
            View queue →
          </Link>
        </div>

        {recentJobs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong bg-bone-50 px-5 py-10 text-center text-sm text-ink-500">
            No jobs yet. Import songs or queue a request to get started.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-bone-50">
            <table className="w-full text-sm">
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
                    Updated
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {recentJobs.map((job) => {
                  const payload = (job.payload ?? {}) as { title?: string; artistName?: string };
                  const subject =
                    job.song?.displayTitle ?? job.artist?.displayName ?? payload.title ?? payload.artistName ?? '—';

                  return (
                    <tr key={job.id}>
                      <td className="max-w-xs truncate px-4 py-2.5 text-ink-800">{subject}</td>
                      <td className="px-4 py-2.5">
                        <Badge tone="muted">{job.type.replace(/_/g, ' ').toLowerCase()}</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <JobStatusBadge status={job.status} />
                      </td>
                      <td className="px-4 py-2.5 text-right text-ink-400" title={formatDateTime(job.updatedAt)}>
                        {relativeTime(job.updatedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {recentBatches.length > 0 && (
        <section>
          <h2 className="eyebrow mb-4">Recent imports</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {recentBatches.map((batch) => (
              <div key={batch.id} className="rounded-xl border border-line bg-bone-50 p-4">
                <div className="text-sm font-medium text-ink-900">{batch.label ?? 'Untitled batch'}</div>
                <div className="mt-1 text-xs text-ink-400">{formatDateTime(batch.createdAt)}</div>
                <dl className="mt-3 space-y-1 text-xs tnum">
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Submitted</dt>
                    <dd className="font-medium text-ink-800">{batch.submittedCount}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Queued</dt>
                    <dd className="font-medium text-ink-800">{batch.queuedCount}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Already reviewed</dt>
                    <dd className="font-medium text-ink-800">{batch.existingCount}</dd>
                  </div>
                </dl>
                <Link
                  href={`/admin/jobs?batch=${batch.id}`}
                  className="mt-3 inline-block text-xs text-volt-700 hover:underline"
                >
                  View jobs →
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  tone = 'neutral',
  href,
}: {
  label: string;
  value: number | string;
  sub?: string;
  tone?: 'neutral' | 'warn' | 'danger';
  href?: string;
}) {
  const toneClass = { neutral: 'text-ink-900', warn: 'text-ochre-700', danger: 'text-flare-700' }[tone];

  const body = (
    <>
      <div className="text-xs text-ink-500">{label}</div>
      <div className={`tnum mt-1.5 text-3xl font-semibold tracking-tight ${toneClass}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-400">{sub}</div>}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="lift block rounded-xl border border-line bg-bone-50 p-4">
        {body}
      </Link>
    );
  }

  return <div className="rounded-xl border border-line bg-bone-50 p-4">{body}</div>;
}
