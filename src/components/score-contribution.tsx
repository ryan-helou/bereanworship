import { cn } from '@/lib/utils';
import { CATEGORY } from './findings';
import { BASELINE, MAX_STRENGTH_CREDIT, SONG_WEIGHTS, type ComponentBreakdown } from '@/lib/scoring';
import type { ScoreComponent } from '@prisma/client';

/**
 * Where the overall score actually came from.
 *
 * The findings list shows what each finding was worth; this shows what that
 * was worth to the song. The two are not the same number, and the gap is where
 * the scoring was previously unreadable:
 *
 *   · Components are weighted 60/20/20, so a point of biblical soundness costs
 *     three times what a point of clarity costs.
 *   · Strength credit is capped per component, so past the cap a further
 *     strength is real but worth nothing to the score. God the Uncreated One
 *     earns +54 of theological credit and banks 30 of it.
 *   · A severe or major concern can impose a ceiling that discards the
 *     arithmetic entirely.
 *
 * All three are stated here rather than left for a reader to infer from
 * numbers that would otherwise refuse to add up.
 */

const ORDER: Array<{ key: ScoreComponent; weight: number }> = [
  { key: 'THEOLOGICAL', weight: SONG_WEIGHTS.THEOLOGICAL },
  { key: 'COMMUNAL', weight: SONG_WEIGHTS.COMMUNAL },
  { key: 'CLARITY', weight: SONG_WEIGHTS.CLARITY },
];

export function ScoreContribution({
  theological,
  communal,
  clarity,
  overallScore,
  overallCeiling,
}: {
  theological: ComponentBreakdown;
  communal: ComponentBreakdown;
  clarity: ComponentBreakdown;
  overallScore: number;
  overallCeiling: number | null;
}) {
  const breakdowns: Record<ScoreComponent, ComponentBreakdown> = {
    THEOLOGICAL: theological,
    COMMUNAL: communal,
    CLARITY: clarity,
  };

  const rows = ORDER.map(({ key, weight }) => {
    const b = breakdowns[key];
    const rawCredit = b.contributions.filter((c) => c.impact > 0).reduce((n, c) => n + c.impact, 0);
    return {
      key,
      weight,
      breakdown: b,
      rawCredit: Math.round(rawCredit * 100) / 100,
      capped: rawCredit > b.strengthCredit,
      contribution: Math.round(b.score * weight * 10) / 10,
      category: CATEGORY[key],
    };
  });

  const summed = Math.round(rows.reduce((n, r) => n + r.contribution, 0) * 10) / 10;

  return (
    <section id="score-breakdown" className="band-bone-light border-b-2 border-ink-900 scroll-mt-24">
      <div className="container-page py-16">
        <h2 className="text-display-sm">Where the score comes from</h2>
        <p className="mt-4 max-w-3xl text-[0.9375rem] leading-relaxed text-ink-600">
          Every finding above is scored against one of these three, and the colour on each finding says which. The
          three are weighted differently, so the same number of points is worth more against biblical soundness than
          against clarity.
        </p>

        {/* The overall score as three stacked contributions. */}
        <div className="mt-10">
          <div className="flex h-10 w-full border-2 border-ink-900" role="img" aria-label={`Overall ${overallScore} out of 100`}>
            {rows.map((r) => (
              <div
                key={r.key}
                className={cn('h-full border-r-2 border-ink-900 last:border-r-0', r.category.bar)}
                style={{ width: `${r.contribution}%` }}
                title={`${r.category.label}: ${r.contribution} of the ${summed} points`}
              />
            ))}
            <div className="h-full flex-1 bg-bone-300" title={`${Math.round((100 - summed) * 10) / 10} points not earned`} />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
            {rows.map((r) => (
              <span key={r.key} className="flex items-center gap-2 text-xs font-semibold text-ink-600">
                <span className={cn('h-3 w-3 border border-ink-900', r.category.bar)} aria-hidden="true" />
                {r.category.label}
                <span className="tnum font-extrabold text-ink-900">{r.contribution}</span>
              </span>
            ))}
            <span className="tnum ml-auto text-xs font-semibold text-ink-500">
              {rows.map((r) => r.contribution).join(' + ')} = {summed}
              {overallCeiling === null ? ` → ${overallScore}` : ''}
            </span>
          </div>
        </div>

        {/* The arithmetic, per component. */}
        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
          {rows.map((r) => (
            <div key={r.key} className="border-2 border-ink-900 bg-bone-50">
              <div className={cn('flex items-baseline justify-between px-4 py-3', r.category.chip)}>
                <span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em]">{r.category.label}</span>
                <span className="tnum text-xs font-bold">{Math.round(r.weight * 100)}%</span>
              </div>

              <dl className="divide-y divide-line px-4 text-sm">
                <Row label="Baseline" value={BASELINE} />
                <Row
                  label="Strengths"
                  value={`+${r.breakdown.strengthCredit}`}
                  note={r.capped ? `capped at ${MAX_STRENGTH_CREDIT} — findings earned +${r.rawCredit}` : undefined}
                />
                <Row label="Concerns" value={r.breakdown.penalty === 0 ? '0' : `−${r.breakdown.penalty}`} />
                {r.breakdown.ceiling !== null && (
                  <Row
                    label="Ceiling"
                    value={r.breakdown.ceiling}
                    note={`a concern at this severity caps the component, whatever the arithmetic gave (${r.breakdown.rawScore})`}
                  />
                )}
                <Row label="Component score" value={r.breakdown.score} strong />
                <Row label={`Contributes (× ${r.weight})`} value={r.contribution} strong />
              </dl>
            </div>
          ))}
        </div>

        {overallCeiling !== null && (
          <p className="mt-6 border-2 border-ochre-600 bg-ochre-50 px-5 py-4 text-sm leading-relaxed text-ochre-900">
            The three contributions come to <strong className="tnum">{summed}</strong>, but a severe or major
            theological concern caps the overall score at <strong className="tnum">{overallCeiling}</strong>. A
            singable, clear song cannot average its way past false teaching.
          </p>
        )}
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  note,
  strong = false,
}: {
  label: string;
  value: string | number;
  note?: string;
  strong?: boolean;
}) {
  return (
    <div className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <dt className={cn('text-ink-600', strong && 'font-bold text-ink-900')}>{label}</dt>
        <dd className={cn('tnum font-semibold text-ink-900', strong && 'text-base font-extrabold')}>{value}</dd>
      </div>
      {note && <p className="mt-1 text-xs leading-snug text-ink-500">{note}</p>}
    </div>
  );
}
