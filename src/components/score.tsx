import { cn } from '@/lib/utils';
import { RECOMMENDATION_BLURB, RECOMMENDATION_LABEL, scoreBand, type ScoreBand } from '@/lib/scoring';
import type { Recommendation } from '@prisma/client';

/**
 * Score presentation.
 *
 * Restrained on purpose: a large number, a thin arc, a quiet label. No badges,
 * no trophies, no gradient meters. The number is the finding; the visual is
 * only there to make it legible at a glance.
 */

const TONE_TEXT: Record<ScoreBand['tone'], string> = {
  excellent: 'text-[var(--color-tone-excellent)]',
  strong: 'text-[var(--color-tone-strong)]',
  sound: 'text-[var(--color-tone-sound)]',
  mixed: 'text-[var(--color-tone-mixed)]',
  concern: 'text-[var(--color-tone-concern)]',
  poor: 'text-[var(--color-tone-poor)]',
  unsound: 'text-[var(--color-tone-unsound)]',
};

const TONE_STROKE: Record<ScoreBand['tone'], string> = {
  excellent: 'stroke-[var(--color-tone-excellent)]',
  strong: 'stroke-[var(--color-tone-strong)]',
  sound: 'stroke-[var(--color-tone-sound)]',
  mixed: 'stroke-[var(--color-tone-mixed)]',
  concern: 'stroke-[var(--color-tone-concern)]',
  poor: 'stroke-[var(--color-tone-poor)]',
  unsound: 'stroke-[var(--color-tone-unsound)]',
};

const TONE_BG: Record<ScoreBand['tone'], string> = {
  excellent: 'bg-[var(--color-tone-excellent)]',
  strong: 'bg-[var(--color-tone-strong)]',
  sound: 'bg-[var(--color-tone-sound)]',
  mixed: 'bg-[var(--color-tone-mixed)]',
  concern: 'bg-[var(--color-tone-concern)]',
  poor: 'bg-[var(--color-tone-poor)]',
  unsound: 'bg-[var(--color-tone-unsound)]',
};

export function toneOf(score: number | null | undefined): ScoreBand['tone'] {
  return scoreBand(score)?.tone ?? 'sound';
}

// ---------------------------------------------------------------------------
// The headline dial
// ---------------------------------------------------------------------------

export function ScoreDial({
  score,
  label,
  caption,
  size = 'lg',
  className,
}: {
  score: number | null | undefined;
  label: string;
  caption?: string;
  size?: 'md' | 'lg';
  className?: string;
}) {
  const band = scoreBand(score);
  const tone = band?.tone ?? 'sound';
  const value = score ?? 0;

  const dimension = size === 'lg' ? 168 : 128;
  const stroke = size === 'lg' ? 5 : 4;
  const radius = (dimension - stroke) / 2 - 2;
  const circumference = 2 * Math.PI * radius;
  const dash = score === null || score === undefined ? 0 : (value / 100) * circumference;

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <div className="relative" style={{ width: dimension, height: dimension }}>
        <svg
          width={dimension}
          height={dimension}
          viewBox={`0 0 ${dimension} ${dimension}`}
          className="-rotate-90"
          aria-hidden="true"
        >
          <circle
            cx={dimension / 2}
            cy={dimension / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="stroke-[var(--color-surface-200)]"
          />
          {score !== null && score !== undefined && (
            <circle
              cx={dimension / 2}
              cy={dimension / 2}
              r={radius}
              fill="none"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
              className={TONE_STROKE[tone]}
            />
          )}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {score === null || score === undefined ? (
            <span className="text-sm text-ink-400">Not reviewed</span>
          ) : (
            <>
              <span
                className={cn(
                  'tnum font-semibold leading-none tracking-tight',
                  size === 'lg' ? 'text-5xl' : 'text-4xl',
                  TONE_TEXT[tone],
                )}
              >
                {value}
              </span>
              <span className="mt-1.5 text-xs text-ink-400 tnum">out of 100</span>
            </>
          )}
        </div>
      </div>

      <div className="mt-4 text-center">
        <div className="eyebrow">{label}</div>
        <div className={cn('mt-1 text-sm font-medium', TONE_TEXT[tone])}>{band?.label ?? '—'}</div>
        {caption && <p className="mt-2 max-w-[22ch] text-xs leading-relaxed text-ink-400">{caption}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component breakdown bar
// ---------------------------------------------------------------------------

export function ScoreBar({
  label,
  score,
  weight,
  description,
}: {
  label: string;
  score: number | null | undefined;
  weight?: string;
  description?: string;
}) {
  const tone = toneOf(score);
  const value = score ?? 0;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-ink-800">{label}</span>
          {weight && <span className="text-xs text-ink-400 tnum">{weight}</span>}
        </div>
        <span className={cn('tnum text-sm font-semibold', TONE_TEXT[tone])}>
          {score === null || score === undefined ? '—' : `${value}`}
          <span className="ml-0.5 font-normal text-ink-300">/100</span>
        </span>
      </div>

      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-200"
        role="img"
        aria-label={`${label}: ${score ?? 'not scored'} out of 100`}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-700', TONE_BG[tone])}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>

      {description && <p className="mt-2 text-xs leading-relaxed text-ink-400">{description}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact score for lists
// ---------------------------------------------------------------------------

export function ScorePill({ score, className }: { score: number | null | undefined; className?: string }) {
  const band = scoreBand(score);
  const tone = band?.tone ?? 'sound';

  if (score === null || score === undefined) {
    return <span className={cn('text-sm text-ink-300', className)}>Not reviewed</span>;
  }

  return (
    <span className={cn('flex items-baseline gap-1', className)}>
      <span className={cn('tnum text-2xl font-semibold leading-none tracking-tight', TONE_TEXT[tone])}>{score}</span>
      <span className="text-sm text-ink-300 tnum">/100</span>
    </span>
  );
}

export function ScoreLabelText({ score }: { score: number | null | undefined }) {
  const band = scoreBand(score);
  if (!band) return <span className="text-ink-400">Not reviewed</span>;
  return <span className={TONE_TEXT[band.tone]}>{band.label}</span>;
}

// ---------------------------------------------------------------------------
// Recommendation
// ---------------------------------------------------------------------------

const RECOMMENDATION_STYLE: Record<Recommendation, string> = {
  RECOMMENDED: 'bg-brand-50 text-brand-800 ring-brand-200',
  RECOMMENDED_WITH_CAUTION: 'bg-amber-50 text-amber-800 ring-amber-200',
  NOT_RECOMMENDED: 'bg-red-50 text-red-800 ring-red-200',
};

export function RecommendationBadge({
  recommendation,
  size = 'md',
}: {
  recommendation: Recommendation | null | undefined;
  size?: 'sm' | 'md';
}) {
  if (!recommendation) {
    return (
      <span className="inline-flex items-center rounded-full bg-surface-100 px-2.5 py-1 text-xs font-medium text-ink-400 ring-1 ring-inset ring-line">
        Not reviewed
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium ring-1 ring-inset',
        size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        RECOMMENDATION_STYLE[recommendation],
      )}
    >
      {RECOMMENDATION_LABEL[recommendation]}
    </span>
  );
}

export function RecommendationCallout({ recommendation }: { recommendation: Recommendation | null | undefined }) {
  if (!recommendation) return null;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <RecommendationBadge recommendation={recommendation} />
      <p className="text-sm text-ink-500">{RECOMMENDATION_BLURB[recommendation]}</p>
    </div>
  );
}
