import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Small shared primitives. Deliberately few — the design lives in the tokens. */

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'brand' | 'warn' | 'danger' | 'muted';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-surface-100 text-ink-600 ring-line',
    brand: 'bg-brand-50 text-brand-800 ring-brand-200',
    warn: 'bg-amber-50 text-amber-800 ring-amber-200',
    danger: 'bg-red-50 text-red-800 ring-red-200',
    muted: 'bg-transparent text-ink-400 ring-line',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="max-w-2xl">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h2 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{title}</h2>
        {description && <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-line-strong bg-surface-50 px-6 py-16 text-center">
      {icon && <div className="mb-4 text-ink-300">{icon}</div>}
      <h3 className="text-base font-semibold text-ink-800">{title}</h3>
      {description && <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-500">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50';

const BUTTON_VARIANTS = {
  primary: 'bg-ink-900 text-white hover:bg-ink-800',
  brand: 'bg-brand-700 text-white hover:bg-brand-800',
  secondary: 'bg-surface-100 text-ink-800 ring-1 ring-inset ring-line hover:bg-surface-200',
  ghost: 'text-ink-600 hover:bg-surface-100 hover:text-ink-900',
  danger: 'bg-red-600 text-white hover:bg-red-700',
} as const;

const BUTTON_SIZES = {
  sm: 'h-8 px-3',
  md: 'h-10 px-4',
  lg: 'h-12 px-6 text-[0.9375rem]',
} as const;

export function buttonClass(
  variant: keyof typeof BUTTON_VARIANTS = 'primary',
  size: keyof typeof BUTTON_SIZES = 'md',
  className?: string,
): string {
  return cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className);
}

export function ButtonLink({
  href,
  children,
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
  className?: string;
} & Omit<React.ComponentProps<typeof Link>, 'href' | 'className' | 'children'>) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}

/** A labelled key/value row, used across detail pages and the admin. */
export function DataRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-line py-2.5 last:border-0">
      <dt className="shrink-0 text-sm text-ink-400">{label}</dt>
      <dd className="text-right text-sm font-medium text-ink-800">{children}</dd>
    </div>
  );
}

export function Panel({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div className={cn('rounded-xl border border-line bg-surface-0', padded && 'p-6', className)}>{children}</div>
  );
}

/**
 * Sample-data notice.
 *
 * Seeded records carry the review version "sample-v1.0". Rather than hide
 * that, the interface says so plainly wherever such a record is displayed —
 * a research tool that quietly showed fabricated scores would be worthless.
 */
export function SampleDataNotice({ reviewVersion }: { reviewVersion: string | null | undefined }) {
  if (!reviewVersion?.startsWith('sample')) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-sm text-amber-900">
        <span className="font-semibold">Sample data.</span> This record was seeded for development. Its scores were
        written by hand to demonstrate the interface — they are not the output of the research pipeline and should not
        be relied on.
      </p>
    </div>
  );
}

export function isSample(reviewVersion: string | null | undefined): boolean {
  return Boolean(reviewVersion?.startsWith('sample'));
}
