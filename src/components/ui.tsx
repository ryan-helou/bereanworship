import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Shared primitives. Hard edges, heavy borders, colour that means something. */

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'brand' | 'warn' | 'danger' | 'muted' | 'dark';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-bone-200 text-ink-700',
    brand: 'bg-volt-500 text-white',
    warn: 'bg-ochre-600 text-white',
    danger: 'bg-flare-600 text-white',
    muted: 'bg-transparent text-ink-500 ring-1 ring-inset ring-line-strong',
    dark: 'bg-indigo-900 text-bone-100',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-1 text-[0.6875rem] font-bold uppercase tracking-[0.08em]',
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
  onDark = false,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  onDark?: boolean;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-6', className)}>
      <div className="max-w-2xl">
        {eyebrow && <div className="eyebrow mb-3">{eyebrow}</div>}
        <h2 className="text-display-sm">{title}</h2>
        {description && (
          <p className={cn('mt-4 text-[1.0625rem] leading-relaxed', onDark ? 'text-indigo-200' : 'text-ink-600')}>
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="border-2 border-dashed border-line-strong bg-bone-50 px-6 py-16 text-center">
      <h3 className="text-2xl font-bold text-ink-900">{title}</h3>
      {description && <p className="mx-auto mt-3 max-w-md text-[0.9375rem] leading-relaxed text-ink-600">{description}</p>}
      {action && <div className="mt-8">{action}</div>}
    </div>
  );
}

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 font-bold uppercase tracking-[0.06em] transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50';

const BUTTON_VARIANTS = {
  primary: 'bg-indigo-900 text-bone-100 hover:bg-indigo-800',
  brand: 'bg-volt-500 text-white hover:bg-volt-600',
  secondary: 'bg-transparent text-ink-900 ring-2 ring-inset ring-ink-900 hover:bg-ink-900 hover:text-bone-100',
  onDark: 'bg-bone-100 text-indigo-900 hover:bg-white',
  onDarkGhost: 'bg-transparent text-bone-100 ring-2 ring-inset ring-bone-100/40 hover:bg-bone-100 hover:text-indigo-900',
  ghost: 'text-ink-600 hover:bg-bone-200 hover:text-ink-900',
  danger: 'bg-flare-600 text-white hover:bg-flare-700',
} as const;

const BUTTON_SIZES = {
  sm: 'h-9 px-3.5 text-xs',
  md: 'h-11 px-5 text-sm',
  lg: 'h-14 px-8 text-[0.9375rem]',
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

export function DataRow({ label, children, onDark = false }: { label: string; children: ReactNode; onDark?: boolean }) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-6 border-b py-3 last:border-0',
        onDark ? 'border-indigo-700' : 'border-line',
      )}
    >
      <dt className={cn('shrink-0 text-xs font-bold uppercase tracking-wider', onDark ? 'text-indigo-300' : 'text-ink-400')}>
        {label}
      </dt>
      <dd className={cn('text-right text-sm font-semibold', onDark ? 'text-bone-100' : 'text-ink-900')}>{children}</dd>
    </div>
  );
}

export function Panel({
  children,
  className,
  padded = true,
  tone = 'light',
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  tone?: 'light' | 'dark' | 'flat';
}) {
  const tones = {
    light: 'border-2 border-ink-900 bg-bone-50',
    flat: 'border border-line-strong bg-bone-50',
    dark: 'border-2 border-indigo-700 bg-indigo-800 text-bone-100',
  };
  return <div className={cn(tones[tone], padded && 'p-6', className)}>{children}</div>;
}

/**
 * Sample-data notice.
 *
 * Seeded records carry the review version "sample-v1.0". Rather than hide
 * that, the interface says so wherever such a record appears — a research
 * tool that quietly showed fabricated scores would be worthless.
 */
export function SampleDataNotice({ reviewVersion }: { reviewVersion: string | null | undefined }) {
  if (!reviewVersion?.startsWith('sample')) return null;

  return (
    <div className="border-l-8 border-ochre-600 bg-ochre-50 px-5 py-4">
      <p className="text-sm leading-relaxed text-ochre-800">
        <span className="font-bold uppercase tracking-wider">Sample data.</span> This record was seeded for
        development. Its scores were written by hand to demonstrate the interface — they are not the output of the
        research pipeline and should not be relied on.
      </p>
    </div>
  );
}

export function isSample(reviewVersion: string | null | undefined): boolean {
  return Boolean(reviewVersion?.startsWith('sample'));
}
