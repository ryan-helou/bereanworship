import { cn } from '@/lib/utils';
import { CATEGORY } from './findings';
import { RUBRIC_MAX_LEVEL, SONG_WEIGHTS, severityLabel, type ComponentRubric } from '@/lib/scoring';
import type { ScoreComponent } from '@prisma/client';

/**
 * Where the score comes from.
 *
 * Each criterion is placed on the rubric at `min(ceiling, merit)`: what the
 * flaws allow, against what the substance earns. Both halves are shown, along
 * with the single finding that set each — because the whole claim of this site
 * is that a number can be traced to the evidence that produced it, and under a
 * rubric that trace is a named finding rather than a column of arithmetic.
 *
 * When the ceiling binds, the panel says so. That is the case a reader is most
 * likely to query: the song has strengths, and they stopped counting.
 */

const ORDER: ScoreComponent[] = ['THEOLOGICAL', 'COMMUNAL', 'CLARITY'];

/** The written anchors, shown against the level a criterion actually reached. */
const ANCHORS: Record<ScoreComponent, Record<number, string>> = {
  THEOLOGICAL: {
    10: 'Teaches a central doctrine with precision and depth. Nothing to correct.',
    8: 'Doctrinally substantial and accurate. Says something real about God, and says it rightly.',
    6: 'Sound, with genuine content, but thin or carrying a reservation worth naming.',
    4: 'Misleading wording, or a real error about an important doctrine.',
    2: 'A significant error about something central — the gospel, Christ, God, salvation.',
    0: 'Denies or fundamentally distorts a central Christian doctrine.',
  },
  COMMUNAL: {
    10: 'A congregation owns it on first hearing and can carry it unaccompanied.',
    8: 'Clearly built for a gathered church. Learned quickly, survives without the band.',
    6: 'Workable congregationally, with a reservation — a demanding key, a form that needs a lead.',
    4: 'A performance piece a congregation can attempt, built around a climax the room cannot supply.',
    2: 'Effectively unsingable together.',
    0: 'Not a congregational song in any meaningful sense.',
  },
  CLARITY: {
    10: 'Every line means one thing, and that thing is plain to a newcomer.',
    8: 'Clear throughout. A hearer knows what they have affirmed.',
    6: 'Mostly clear, with a word or image doing more work than it can bear.',
    4: 'A load-bearing ambiguity the song never resolves.',
    2: 'Persistently unclear.',
    0: 'Meaningless or self-contradictory as sung.',
  },
};

/** Falls back to the anchor below, which is what an odd level means. */
function anchorFor(component: ScoreComponent, level: number): { level: number; text: string; between: boolean } {
  const anchors = ANCHORS[component];
  if (anchors[level]) return { level, text: anchors[level], between: false };
  const below = level - 1;
  return { level: below, text: anchors[below] ?? '', between: true };
}

export function ScoreContribution({
  theological,
  communal,
  clarity,
  overallScore,
  overallCeiling,
}: {
  theological: ComponentRubric;
  communal: ComponentRubric;
  clarity: ComponentRubric;
  overallScore: number | null;
  overallCeiling: number | null;
}) {
  const rubrics: Record<ScoreComponent, ComponentRubric> = {
    THEOLOGICAL: theological,
    COMMUNAL: communal,
    CLARITY: clarity,
  };

  const rated = ORDER.filter((c) => rubrics[c].level !== null);
  const totalWeight = rated.reduce((n, c) => n + SONG_WEIGHTS[c], 0);

  const rows = ORDER.map((key) => {
    const r = rubrics[key];
    const effectiveWeight = r.level === null ? 0 : SONG_WEIGHTS[key] / totalWeight;
    return {
      key,
      rubric: r,
      category: CATEGORY[key],
      weight: SONG_WEIGHTS[key],
      effectiveWeight,
      contribution: r.score === null ? null : Math.round(r.score * effectiveWeight * 10) / 10,
    };
  });

  return (
    <section id="score-breakdown" className="band-bone-light border-b-2 border-ink-900 scroll-mt-24">
      <div className="container-page py-16">
        <h2 className="text-display-sm">Where the score comes from</h2>
        <p className="mt-4 max-w-3xl text-[0.9375rem] leading-relaxed text-ink-600">
          Each criterion is placed on a rubric from 0 to {RUBRIC_MAX_LEVEL} by the findings above — the colour on each
          finding says which criterion it belongs to. A level is the lower of what the flaws allow and what the
          substance earns, so no accumulation of praise can lift a song past its worst problem.
        </p>

        {/* The overall score as its weighted parts. */}
        {overallScore !== null && (
          <div className="mt-10">
            <div
              className="flex h-10 w-full border-2 border-ink-900"
              role="img"
              aria-label={`Overall ${overallScore} out of 100`}
            >
              {rows
                .filter((r) => r.contribution !== null)
                .map((r) => (
                  <div
                    key={r.key}
                    className={cn('h-full border-r-2 border-ink-900 last:border-r-0', r.category.bar)}
                    style={{ width: `${r.contribution}%` }}
                    title={`${r.category.label}: ${r.contribution} points of the total`}
                  />
                ))}
              <div className="h-full flex-1 bg-bone-300" />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
              {rows.map((r) => (
                <span key={r.key} className="flex items-center gap-2 text-xs font-semibold text-ink-600">
                  <span className={cn('h-3 w-3 border border-ink-900', r.category.bar)} aria-hidden="true" />
                  {r.category.label}
                  {r.rubric.level === null ? (
                    <span className="font-bold uppercase tracking-wide text-ink-400">unrated</span>
                  ) : (
                    <span className="tnum font-extrabold text-ink-900">
                      {r.rubric.level}/{RUBRIC_MAX_LEVEL}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
          {rows.map((r) => (
            <RubricCard key={r.key} component={r.key} rubric={r.rubric} category={r.category} weight={r.weight} />
          ))}
        </div>

        {overallCeiling !== null && (
          <p className="mt-6 border-2 border-ochre-600 bg-ochre-50 px-5 py-4 text-sm leading-relaxed text-ochre-900">
            Biblical soundness caps the total at <strong className="tnum">{overallCeiling}</strong>. The other criteria
            averaged higher, but a singable, clear song cannot average its way past what it teaches.
          </p>
        )}
      </div>
    </section>
  );
}

function RubricCard({
  component,
  rubric,
  category,
  weight,
}: {
  component: ScoreComponent;
  rubric: ComponentRubric;
  category: (typeof CATEGORY)[string];
  weight: number;
}) {
  return (
    <div className="border-2 border-ink-900 bg-bone-50">
      <div className={cn('flex items-baseline justify-between px-4 py-3', category.chip)}>
        <span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em]">{category.label}</span>
        <span className="tnum text-xs font-bold">{Math.round(weight * 100)}%</span>
      </div>

      {rubric.level === null ? (
        <div className="px-4 py-6">
          <p className="text-sm font-bold text-ink-900">Unrated</p>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-500">
            No findings were recorded against this criterion, so there is nothing to judge. It is excluded from the
            overall score rather than given a default one.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2 border-b border-line px-4 py-4">
            <span className="tnum text-4xl font-extrabold leading-none text-ink-900">{rubric.level}</span>
            <span className="tnum text-sm font-bold text-ink-400">/ {RUBRIC_MAX_LEVEL}</span>
          </div>

          {(() => {
            const anchor = anchorFor(component, rubric.level!);
            return (
              <p className="border-b border-line px-4 py-3 text-xs leading-relaxed text-ink-600">
                {anchor.between && <span className="font-bold text-ink-900">Between anchors. </span>}
                {anchor.between ? `Level ${anchor.level}: ` : ''}
                {anchor.text}
              </p>
            );
          })()}

          <dl className="divide-y divide-line px-4 text-sm">
            <Decider
              label="Ceiling"
              // Marked on equality too: when the flaws allow exactly what the
              // substance earns, both halves decided the level, and crediting
              // only one of them would misdescribe the result.
              binding={rubric.level === rubric.ceiling}
              value={rubric.ceiling!}
              note={
                rubric.ceilingSetBy
                  ? `set by the worst concern — ${severityLabel('CONCERN', rubric.ceilingSetBy.severity).toLowerCase()}` +
                    `${rubric.ceilingSetBy.centrality === 'CORE' ? ', core doctrine' : ''}` +
                    `${rubric.ceilingSetBy.centrality === 'PERIPHERAL' ? ', peripheral' : ''}` +
                    `${rubric.ceilingSetBy.recurring ? ', recurring' : ''}`
                  : 'no concerns were recorded'
              }
            />
            <Decider
              label="Merit"
              value={rubric.merit!}
              binding={rubric.level === rubric.merit}
              note={
                rubric.meritSetBy
                  ? `set by the best strength — ${severityLabel('STRENGTH', rubric.meritSetBy.severity).toLowerCase()}` +
                    `, across ${rubric.strengthCount} ${rubric.strengthCount === 1 ? 'strength' : 'strengths'}`
                  : 'no strengths were recorded'
              }
            />
          </dl>

          {rubric.ceilingBinds && (
            <p className="border-t border-line px-4 py-3 text-xs leading-relaxed text-ink-500">
              The substance here earns {rubric.merit}, but the worst concern holds the level to {rubric.ceiling}.
              Further strengths do not raise it — merit cannot buy off a fault.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Decider({
  label,
  value,
  note,
  binding,
}: {
  label: string;
  value: number;
  note: string;
  binding: boolean;
}) {
  return (
    <div className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <dt className={cn('text-ink-600', binding && 'font-bold text-ink-900')}>
          {label}
          {binding && <span className="ml-1.5 text-[0.625rem] font-bold uppercase tracking-wide text-ink-400">decides</span>}
        </dt>
        <dd className={cn('tnum font-semibold text-ink-900', binding && 'text-base font-extrabold')}>{value}</dd>
      </div>
      <p className="mt-1 text-xs leading-snug text-ink-500">{note}</p>
    </div>
  );
}
