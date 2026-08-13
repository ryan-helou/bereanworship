import { cn } from '@/lib/utils';
import { RECOMMENDATION_BLURB, RECOMMENDATION_LABEL, scoreBand, type ScoreBand } from '@/lib/scoring';
import type { Recommendation } from '@prisma/client';

/**
 * Score presentation.
 *
 * A score is the headline finding, so it is set at headline scale: an
 * oversized numeral filling a block of colour, not a small figure beside a
 * ring. Colour carries the verdict — indigo and electric blue for sound work,
 * ochre for caution, warm red for genuine concern — so the judgement is
 * legible before a single word is read.
 */

/** Background + foreground for a filled score block. */
const TONE_BLOCK: Record<ScoreBand['tone'], string> = {
  excellent: 'bg-volt-700 text-white',
  strong: 'bg-volt-500 text-white',
  sound: 'bg-indigo-900 text-bone-100',
  mixed: 'bg-ochre-600 text-white',
  concern: 'bg-flare-600 text-white',
  poor: 'bg-flare-700 text-white',
  unsound: 'bg-flare-800 text-white',
};

const TONE_TEXT: Record<ScoreBand['tone'], string> = {
  excellent: 'text-volt-700',
  strong: 'text-volt-600',
  sound: 'text-indigo-900',
  mixed: 'text-ochre-700',
  concern: 'text-flare-600',
  poor: 'text-flare-700',
  unsound: 'text-flare-800',
};

const TONE_BG: Record<ScoreBand['tone'], string> = {
  excellent: 'bg-volt-700',
  strong: 'bg-volt-500',
  sound: 'bg-indigo-900',
  mixed: 'bg-ochre-600',
  concern: 'bg-flare-600',
  poor: 'bg-flare-700',
  unsound: 'bg-flare-800',
};

/**
 * Bar fills on the indigo band.
 *
 * The "sound" tone is indigo-900 — the same colour as the band itself — so on
 * a dark background the bar for a perfectly respectable 74 vanishes entirely.
 * The dark variants keep every tone legible against indigo while preserving
 * the meaning each colour carries.
 */
const TONE_BG_ON_DARK: Record<ScoreBand['tone'], string> = {
  excellent: 'bg-volt-400',
  strong: 'bg-volt-500',
  sound: 'bg-bone-200',
  mixed: 'bg-ochre-600',
  concern: 'bg-flare-500',
  poor: 'bg-flare-600',
  unsound: 'bg-flare-700',
};

export function toneOf(score: number | null | undefined): ScoreBand['tone'] {
  return scoreBand(score)?.tone ?? 'sound';
}

// ---------------------------------------------------------------------------
// The headline score block
// ---------------------------------------------------------------------------

export function ScoreBlock({
  score,
  label,
  caption,
  className,
}: {
  score: number | null | undefined;
  label: string;
  caption?: string;
  className?: string;
}) {
  const band = scoreBand(score);
  const tone = band?.tone ?? 'sound';

  if (score === null || score === undefined) {
    return (
      <div className={cn('border-2 border-ink-900 bg-bone-200 px-8 py-10 text-center', className)}>
        <div className="eyebrow">{label}</div>
        <div className="mt-4 text-2xl font-bold text-ink-500">Not reviewed</div>
      </div>
    );
  }

  return (
    <div className={cn('border-2 border-ink-900', TONE_BLOCK[tone], className)}>
      <div className="border-b-2 border-white/20 px-6 py-3">
        <div className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-white/70">{label}</div>
      </div>

      <div className="px-6 py-8 text-center">
        <div className="text-score">{score}</div>
        <div className="mt-3 text-sm font-semibold uppercase tracking-[0.12em] text-white/80">
          {band?.label}
        </div>
        <div className="mt-1 text-xs text-white/55 tnum">out of 100</div>
      </div>

      {caption && (
        <p className="border-t-2 border-white/20 px-6 py-4 text-xs leading-relaxed text-white/70">{caption}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component breakdown
// ---------------------------------------------------------------------------

export function ScoreBar({
  label,
  score,
  weight,
  description,
  onDark = false,
}: {
  label: string;
  score: number | null | undefined;
  weight?: string;
  description?: string;
  onDark?: boolean;
}) {
  const tone = toneOf(score);
  const value = score ?? 0;

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div className="flex items-baseline gap-2.5">
          <span className={cn('text-[0.9375rem] font-bold', onDark ? 'text-bone-100' : 'text-ink-900')}>{label}</span>
          {weight && (
            <span className={cn('text-xs font-semibold tnum', onDark ? 'text-indigo-300' : 'text-ink-400')}>
              {weight}
            </span>
          )}
        </div>
        <span className={cn('text-score-sm', onDark ? 'text-bone-100' : TONE_TEXT[tone])}>
          {score === null || score === undefined ? '—' : value}
        </span>
      </div>

      <div
        className={cn('mt-2 h-3 w-full', onDark ? 'bg-indigo-700' : 'bg-bone-300')}
        role="img"
        aria-label={`${label}: ${score ?? 'not scored'} out of 100`}
      >
        <div
          className={cn('h-full transition-[width] duration-500', onDark ? TONE_BG_ON_DARK[tone] : TONE_BG[tone])}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>

      {description && (
        <p className={cn('mt-2 text-xs leading-relaxed', onDark ? 'text-indigo-300' : 'text-ink-500')}>{description}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact score for lists
// ---------------------------------------------------------------------------

export function ScorePill({ score, className }: { score: number | null | undefined; className?: string }) {
  const tone = toneOf(score);

  if (score === null || score === undefined) {
    return (
      <span className={cn('bg-bone-300 px-3 py-2 text-sm font-bold text-ink-500', className)}>Not reviewed</span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex min-w-[4.25rem] items-baseline justify-center gap-0.5 px-3 py-2',
        TONE_BLOCK[tone],
        className,
      )}
    >
      <span className="tnum text-3xl font-extrabold leading-none tracking-tight">{score}</span>
      <span className="text-xs font-semibold text-white/60 tnum">/100</span>
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
  RECOMMENDED: 'bg-volt-500 text-white',
  RECOMMENDED_WITH_CAUTION: 'bg-ochre-600 text-white',
  NOT_RECOMMENDED: 'bg-flare-600 text-white',
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
      <span className="inline-flex items-center bg-bone-300 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-ink-500">
        Not reviewed
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center font-bold uppercase tracking-[0.08em]',
        size === 'sm' ? 'px-2.5 py-1 text-[0.6875rem]' : 'px-4 py-2 text-sm',
        RECOMMENDATION_STYLE[recommendation],
      )}
    >
      {RECOMMENDATION_LABEL[recommendation]}
    </span>
  );
}

export function RecommendationCallout({
  recommendation,
  onDark = false,
}: {
  recommendation: Recommendation | null | undefined;
  onDark?: boolean;
}) {
  if (!recommendation) return null;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
      <RecommendationBadge recommendation={recommendation} />
      <p className={cn('text-[0.9375rem]', onDark ? 'text-indigo-200' : 'text-ink-600')}>
        {RECOMMENDATION_BLURB[recommendation]}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vocal range
// ---------------------------------------------------------------------------

/**
 * Range difficulty, reported next to song validity but visibly separate from
 * it. The separation is the point: range is a property of the key the
 * arrangement is published in, so a low score is a reason to transpose, not a
 * verdict on the song.
 *
 * Higher is easier, matching every other number on the site, and the
 * difficulty label is shown alongside so the direction is never ambiguous.
 */
const RANGE_TONE = (score: number): string => {
  if (score >= 85) return 'bg-volt-700 text-white';
  if (score >= 70) return 'bg-volt-500 text-white';
  if (score >= 55) return 'bg-ochre-600 text-white';
  if (score >= 40) return 'bg-flare-600 text-white';
  return 'bg-flare-800 text-white';
};

export function RangeBlock({
  score,
  label,
  lowest,
  highest,
  rangeKey,
  note,
  source,
}: {
  score: number | null | undefined;
  label: string | null;
  lowest: string | null;
  highest: string | null;
  rangeKey: string | null;
  note: string | null;
  source: string | null;
}) {
  if (score === null || score === undefined || !lowest || !highest) {
    return (
      <div className="border-2 border-indigo-600 bg-indigo-950 p-6">
        <div className="eyebrow">Congregational range</div>
        <p className="mt-3 text-lg font-bold text-bone-100">Not measured</p>
        <p className="mt-2 text-sm leading-relaxed text-indigo-300">
          {note ??
            'No verified chart was available, so no range is published. A guessed range would be worse than none — a worship leader would act on it.'}
        </p>
      </div>
    );
  }

  return (
    <div className="border-2 border-ink-900">
      <div className={cn('flex items-center justify-between gap-4 px-5 py-4', RANGE_TONE(score))}>
        <div>
          <div className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-white/70">
            Congregational range
          </div>
          <div className="mt-1 text-xl font-extrabold uppercase tracking-tight">{label}</div>
        </div>
        <div className="text-right">
          <div className="tnum text-4xl font-extrabold leading-none">{score}</div>
          <div className="text-[0.625rem] font-semibold uppercase tracking-widest text-white/60">easier is higher</div>
        </div>
      </div>

      <dl className="grid grid-cols-2 divide-x divide-line border-t-2 border-ink-900 bg-bone-50">
        <div className="px-5 py-3">
          <dt className="text-[0.625rem] font-bold uppercase tracking-[0.12em] text-ink-400">Melody spans</dt>
          <dd className="tnum mt-1 text-lg font-bold text-ink-900">
            {lowest} – {highest}
          </dd>
        </div>
        <div className="px-5 py-3">
          <dt className="text-[0.625rem] font-bold uppercase tracking-[0.12em] text-ink-400">Measured in</dt>
          <dd className="mt-1 text-lg font-bold text-ink-900">{rangeKey ?? '—'}</dd>
        </div>
      </dl>

      <p className="border-t border-line bg-bone-50 px-5 py-3 text-xs leading-relaxed text-ink-500">
        {note ?? 'Measured from the published melody line.'}
        {source && <span className="block mt-1 text-ink-400">Source: {source}</span>}
        <span className="mt-1 block font-semibold text-ink-600">
          Separate from song validity — transposing changes this, so it is a reason to change key, not a verdict on
          the song.
        </span>
      </p>
    </div>
  );
}

/** Compact range chip for list rows. */
export function RangePill({ score, lowest, highest }: { score: number | null; lowest: string | null; highest: string | null }) {
  if (score === null || score === undefined || !lowest || !highest) return null;

  return (
    <span className="inline-flex items-center gap-1.5 bg-bone-200 px-2 py-1 text-[0.6875rem] font-bold uppercase tracking-wider text-ink-600">
      <span className={cn('tnum px-1.5 py-0.5 text-white', RANGE_TONE(score))}>{score}</span>
      {lowest}–{highest}
    </span>
  );
}
