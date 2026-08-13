import { cn } from '@/lib/utils';
import type { JobStatus } from '@prisma/client';

const STATUS_STYLE: Record<JobStatus, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-bone-200 text-ink-600 ring-line' },
  RESEARCHING: { label: 'Researching', className: 'bg-volt-50 text-volt-800 ring-volt-200' },
  ANALYZING: { label: 'Analysing', className: 'bg-volt-50 text-volt-800 ring-volt-200' },
  SCORING: { label: 'Scoring', className: 'bg-volt-50 text-volt-800 ring-volt-200' },
  COMPLETED: { label: 'Completed', className: 'bg-volt-50 text-volt-800 ring-volt-200' },
  FAILED: { label: 'Failed', className: 'bg-flare-50 text-flare-800 ring-flare-200' },
  NEEDS_REVIEW: { label: 'Needs review', className: 'bg-ochre-50 text-ochre-800 ring-ochre-200' },
  CANCELLED: { label: 'Cancelled', className: 'bg-bone-200 text-ink-400 ring-line' },
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
