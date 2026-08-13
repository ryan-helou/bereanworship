import { cn } from '@/lib/utils';
import type { JobStatus } from '@prisma/client';

const STATUS_STYLE: Record<JobStatus, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-surface-100 text-ink-600 ring-line' },
  RESEARCHING: { label: 'Researching', className: 'bg-brand-50 text-brand-800 ring-brand-200' },
  ANALYZING: { label: 'Analysing', className: 'bg-brand-50 text-brand-800 ring-brand-200' },
  SCORING: { label: 'Scoring', className: 'bg-brand-50 text-brand-800 ring-brand-200' },
  COMPLETED: { label: 'Completed', className: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  FAILED: { label: 'Failed', className: 'bg-red-50 text-red-800 ring-red-200' },
  NEEDS_REVIEW: { label: 'Needs review', className: 'bg-amber-50 text-amber-800 ring-amber-200' },
  CANCELLED: { label: 'Cancelled', className: 'bg-surface-100 text-ink-400 ring-line' },
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const style = STATUS_STYLE[status];
  const active = ['RESEARCHING', 'ANALYZING', 'SCORING'].includes(status);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        style.className,
      )}
    >
      {active && <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden="true" />}
      {style.label}
    </span>
  );
}
