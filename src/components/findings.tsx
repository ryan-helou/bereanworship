import { cn } from '@/lib/utils';
import { severityLabel } from '@/lib/scoring';
import { Badge } from './ui';
import type { ArtistFinding, FindingType, SongFinding, Severity } from '@prisma/client';

/**
 * Finding presentation.
 *
 * A finding is the atomic unit of a review: a claim, the evidence for it, and
 * the weight it carried. All three are shown — including the exact points the
 * finding contributed — because a score nobody can audit is just an opinion
 * with a number attached.
 *
 * Severity is carried by a thick coloured spine down the left edge, so the
 * seriousness of a page's concerns is legible from across the room.
 *
 * Deliberately compact. A finding is one claim in one sentence, and the layout
 * is tuned for scanning a column of them rather than reading an essay — the
 * scripture citation sits on a rule rather than in a box, and nothing gets
 * more vertical space than the claim itself.
 */

/**
 * Which of the three component scores a finding moves.
 *
 * Every finding is scored against exactly one component, and until now the
 * page showed the points without saying which score they moved — so a −12 was
 * legible as "bad" and illegible as "bad *at what*". The colour is the link
 * between a finding here and its column in the contribution breakdown.
 */
export const CATEGORY: Record<string, { label: string; short: string; text: string; chip: string; bar: string }> = {
  THEOLOGICAL: {
    label: 'Biblical / Theological',
    short: 'Biblical',
    text: 'text-cat-biblical',
    chip: 'bg-cat-biblical-tint text-cat-biblical',
    bar: 'bg-cat-biblical',
  },
  COMMUNAL: {
    label: 'Communal Worship',
    short: 'Communal',
    text: 'text-cat-communal',
    chip: 'bg-cat-communal-tint text-cat-communal',
    bar: 'bg-cat-communal',
  },
  CLARITY: {
    label: 'Clarity',
    short: 'Clarity',
    text: 'text-cat-clarity',
    chip: 'bg-cat-clarity-tint text-cat-clarity',
    bar: 'bg-cat-clarity',
  },
};

const SEVERITY_BADGE: Record<Severity, { concern: string; strength: string }> = {
  MINOR: { concern: 'bg-bone-300 text-ink-700', strength: 'bg-volt-100 text-volt-700' },
  MODERATE: { concern: 'bg-ochre-600 text-white', strength: 'bg-volt-400 text-white' },
  MAJOR: { concern: 'bg-flare-600 text-white', strength: 'bg-volt-500 text-white' },
  SEVERE: { concern: 'bg-flare-800 text-white', strength: 'bg-volt-700 text-white' },
};

const SPINE: Record<Severity, string> = {
  MINOR: 'bg-bone-400',
  MODERATE: 'bg-ochre-600',
  MAJOR: 'bg-flare-600',
  SEVERE: 'bg-flare-800',
};

export function SongFindingItem({ finding, role }: { finding: SongFinding; role?: FindingRole }) {
  const isConcern = finding.type === 'CONCERN';

  return (
    <article className="flex border-2 border-ink-900 bg-bone-50">
      <div className={cn('w-2 shrink-0', isConcern ? SPINE[finding.severity] : 'bg-volt-500')} aria-hidden="true" />

      <div className="min-w-0 flex-1 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <SeverityBadge type={finding.type} severity={finding.severity} />
          <Badge tone="muted">{finding.category}</Badge>
          {isConcern && finding.centrality === 'CORE' && <Badge tone="warn">Core</Badge>}
          {isConcern && finding.recurring && <Badge tone="muted">Recurring</Badge>}
          <CriterionTag component={finding.component} role={role} />
        </div>

        <h3 className="mt-3 text-[1.0625rem] font-bold leading-snug tracking-tight text-ink-900">{finding.title}</h3>

        <p className="mt-1.5 text-[0.9375rem] leading-normal text-ink-600">{finding.explanation}</p>

        <Provenance
          location={finding.songLocation}
          detail={finding.locationDetail}
          excerpt={finding.lyricExcerpt}
        />


        {finding.scriptureReference && (
          <div className="mt-3 border-t border-line pt-2.5">
            <p className="text-sm">
              <span className="font-bold text-volt-600">{finding.scriptureReference}</span>
              {finding.scriptureRationale && (
                <span className="text-ink-500"> — {finding.scriptureRationale}</span>
              )}
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

export function ArtistFindingItem({
  finding,
  source,
}: {
  finding: ArtistFinding;
  source?: { url: string; title: string; publisher: string | null; credibilityTier: string } | null;
}) {
  const isConcern = finding.type === 'CONCERN';

  return (
    <article className="flex border-2 border-ink-900 bg-bone-50">
      <div className={cn('w-2 shrink-0', isConcern ? SPINE[finding.severity] : 'bg-volt-500')} aria-hidden="true" />

      <div className="min-w-0 flex-1 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <SeverityBadge type={finding.type} severity={finding.severity} />
          <Badge tone="muted">{finding.category}</Badge>
          <EvidenceGradeBadge grade={finding.evidenceGrade} />
          {finding.contested && <Badge tone="warn">Contested</Badge>}
          <ScoreImpact impact={finding.scoreImpact} />
        </div>

        <h3 className="mt-3 text-[1.0625rem] font-bold leading-snug tracking-tight text-ink-900">{finding.title}</h3>

        <p className="mt-1.5 text-[0.9375rem] leading-normal text-ink-600">{finding.explanation}</p>

        {finding.evidence && (
          <p className="mt-2.5 border-l-2 border-ink-900 pl-3 text-sm text-ink-600">{finding.evidence}</p>
        )}

        {(source || finding.contested) && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2.5 text-sm">
            {source && (
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="font-bold text-volt-600 underline underline-offset-4 hover:text-volt-700"
              >
                {source.publisher ?? source.title}
              </a>
            )}
            {finding.contested && (
              <span className="text-xs text-ochre-700">Weight capped — evidence disputed or lower-tier.</span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

const LOCATION_LABEL: Record<string, string> = {
  VERSE: 'Verse',
  VERSE_1: 'Verse 1',
  VERSE_2: 'Verse 2',
  VERSE_3: 'Verse 3',
  VERSE_4: 'Verse 4',
  PRE_CHORUS: 'Pre-chorus',
  CHORUS: 'Chorus',
  REFRAIN: 'Refrain',
  BRIDGE: 'Bridge',
  TAG: 'Tag',
  INTRO: 'Intro',
  OUTRO: 'Outro',
  THROUGHOUT: 'Throughout',
  WHOLE_SONG: 'The song as a whole',
  NOT_LYRICAL: 'Music and structure',
};

/**
 * Where the finding came from, and — when the review spent a quote on it — the
 * words themselves.
 *
 * Most findings show only the location. That is the deliberate shape of a
 * review that quotes a handful of lines rather than reprinting the song: the
 * reader is told exactly where to look and can open their own copy. The
 * location leads even when a quote follows, because it is the part that is
 * always there.
 */
function Provenance({
  location,
  detail,
  excerpt,
}: {
  location: string;
  detail: string | null;
  excerpt: string | null;
}) {
  const label = LOCATION_LABEL[location];
  if (!label && !excerpt) return null;

  return (
    <div className="mt-2.5 border-l-2 border-ink-900 pl-3">
      {label && (
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-ink-500">
          {label}
          {detail && <span className="font-semibold normal-case tracking-normal text-ink-400"> · {detail}</span>}
        </p>
      )}
      {excerpt && (
        <blockquote className={cn('font-serif text-sm italic text-ink-600', label && 'mt-1')}>
          “{excerpt}”
        </blockquote>
      )}
    </div>
  );
}

/**
 * Points contributed by an *artist* finding.
 *
 * Artist research still uses the additive model — baseline, credit, penalty —
 * so a signed number is an accurate description of what one of its findings
 * did. Song findings no longer work that way; see `CriterionTag`.
 */
function ScoreImpact({ impact }: { impact: number }) {
  if (impact === 0) return null;
  const positive = impact > 0;

  return (
    <span
      className={cn(
        'tnum ml-auto px-2 py-1 text-[0.6875rem] font-extrabold text-white',
        positive ? 'bg-volt-500' : 'bg-flare-600',
      )}
      title={`This finding contributed ${positive ? '+' : ''}${impact} points`}
    >
      {positive ? '+' : ''}
      {Number.isInteger(impact) ? impact : impact.toFixed(1)}
    </span>
  );
}

/** Whether this finding is the one that decided its criterion's level. */
export type FindingRole = 'SETS_CEILING' | 'SETS_MERIT' | null;

/**
 * Which criterion this finding belongs to, and whether it decided the level.
 *
 * There is deliberately no point value here. Under the rubric a finding does
 * not contribute points — the level is `min(ceiling, merit)`, chosen by the
 * single worst concern and the single best strength. Printing a ±number beside
 * findings that did not set either would describe an arithmetic the score no
 * longer uses, which is a more confusing kind of wrong than printing nothing.
 *
 * So the badge answers the two questions that are still true: which score does
 * this move, and was it this finding that moved it.
 */
function CriterionTag({ component, role }: { component?: string | null; role?: FindingRole }) {
  const category = component ? CATEGORY[component] : undefined;
  if (!category) return null;

  const decides = role === 'SETS_CEILING' || role === 'SETS_MERIT';

  return (
    <span
      className="ml-auto inline-flex items-stretch"
      title={
        role === 'SETS_CEILING'
          ? `The most serious concern against ${category.label} — it sets the ceiling for that criterion`
          : role === 'SETS_MERIT'
            ? `The strongest finding for ${category.label} — it sets the merit for that criterion`
            : `Scored against ${category.label}`
      }
    >
      <span
        className={cn(
          'inline-flex items-center px-2 py-1 text-[0.625rem] font-bold uppercase tracking-[0.06em]',
          category.chip,
        )}
      >
        {category.short}
      </span>
      {decides && (
        <span
          className={cn(
            'inline-flex items-center px-2 py-1 text-[0.625rem] font-bold uppercase tracking-[0.06em] text-white',
            role === 'SETS_CEILING' ? 'bg-flare-600' : 'bg-volt-500',
          )}
        >
          {role === 'SETS_CEILING' ? 'Sets ceiling' : 'Sets merit'}
        </span>
      )}
    </span>
  );
}

function SeverityBadge({ type, severity }: { type: FindingType; severity: Severity }) {
  const style = SEVERITY_BADGE[severity][type === 'CONCERN' ? 'concern' : 'strength'];
  const noun = type === 'CONCERN' ? 'concern' : 'strength';

  return (
    <span className={cn('inline-flex items-center px-2.5 py-1 text-[0.6875rem] font-bold uppercase tracking-[0.08em]', style)}>
      {severityLabel(type, severity)} {noun}
    </span>
  );
}

const EVIDENCE_LABEL: Record<string, string> = {
  DIRECT_STATEMENT: 'Direct statement',
  DOCUMENTED_FACT: 'Documented fact',
  CREDIBLE_REPORTING: 'Credible reporting',
  ALLEGATION: 'Allegation',
  INTERPRETATION: 'Interpretation',
  THEOLOGICAL_INFERENCE: 'Theological inference',
};

/** The epistemic status of a claim, always visible — never buried. */
export function EvidenceGradeBadge({ grade }: { grade: string }) {
  const weak = grade === 'ALLEGATION' || grade === 'INTERPRETATION';
  return <Badge tone={weak ? 'warn' : 'muted'}>{EVIDENCE_LABEL[grade] ?? grade}</Badge>;
}

export function componentLabel(component: string): string {
  return (
    { THEOLOGICAL: 'biblical soundness', COMMUNAL: 'congregational suitability', CLARITY: 'clarity' }[component] ??
    component
  );
}

export function artistComponentLabel(component: string): string {
  return (
    {
      DOCTRINE: 'doctrinal soundness',
      AFFILIATIONS: 'affiliations',
      PUBLIC_TEACHING: 'public teaching',
      MINISTRY_CONTEXT: 'ministry context',
    }[component] ?? component
  );
}

export function FindingGroup({
  title,
  description,
  count,
  children,
  emptyMessage,
}: {
  title: string;
  description: string;
  count: number;
  children: React.ReactNode;
  emptyMessage: string;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-4 border-b-4 border-ink-900 pb-4">
        <h2 className="text-display-sm">{title}</h2>
        <span className="tnum text-2xl font-extrabold text-volt-600">{count}</span>
      </div>
      <p className="mt-4 text-[0.9375rem] text-ink-600">{description}</p>

      {count === 0 ? (
        <p className="mt-6 border-2 border-dashed border-line-strong bg-bone-50 px-5 py-10 text-center text-sm font-semibold text-ink-500">
          {emptyMessage}
        </p>
      ) : (
        <div className="mt-5 space-y-3">{children}</div>
      )}
    </section>
  );
}
