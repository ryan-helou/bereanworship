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
 */

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

export function SongFindingItem({ finding }: { finding: SongFinding }) {
  const isConcern = finding.type === 'CONCERN';

  return (
    <article className="flex border-2 border-ink-900 bg-bone-50">
      <div className={cn('w-2 shrink-0', isConcern ? SPINE[finding.severity] : 'bg-volt-500')} aria-hidden="true" />

      <div className="min-w-0 flex-1 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge type={finding.type} severity={finding.severity} />
          <Badge tone="muted">{finding.category}</Badge>
          {isConcern && finding.centrality === 'CORE' && <Badge tone="warn">Core doctrine</Badge>}
          {isConcern && finding.recurring && <Badge tone="muted">Recurring</Badge>}
        </div>

        <h3 className="mt-4 text-xl font-bold leading-tight tracking-tight text-ink-900">{finding.title}</h3>

        <p className="mt-3 font-serif text-[1.0625rem] leading-relaxed text-ink-700">{finding.explanation}</p>

        {finding.lyricExcerpt && (
          <figure className="mt-5">
            <blockquote className="border-l-4 border-ink-900 pl-4 font-serif text-[1.0625rem] italic leading-relaxed text-ink-700">
              “{finding.lyricExcerpt}”
            </blockquote>
            <figcaption className="mt-2 pl-4 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-ink-400">
              Lyric excerpt — quoted briefly for analysis
            </figcaption>
          </figure>
        )}

        {finding.scriptureReference && (
          <div className="mt-5 border-l-4 border-volt-500 bg-volt-50 p-4">
            <div className="eyebrow">Biblical basis</div>
            <p className="mt-2 text-lg font-bold text-volt-700">{finding.scriptureReference}</p>
            {finding.scriptureExcerpt && (
              <p className="mt-3 font-serif text-[0.9375rem] italic leading-relaxed text-ink-600">
                {finding.scriptureExcerpt}
                <span className="ml-1.5 text-[0.625rem] font-bold uppercase not-italic tracking-widest text-ink-400">
                  ESV
                </span>
              </p>
            )}
            {finding.scriptureRationale && (
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-700">{finding.scriptureRationale}</p>
            )}
          </div>
        )}

        <ScoreImpact impact={finding.scoreImpact} component={componentLabel(finding.component)} />
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

      <div className="min-w-0 flex-1 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge type={finding.type} severity={finding.severity} />
          <Badge tone="muted">{finding.category}</Badge>
          <EvidenceGradeBadge grade={finding.evidenceGrade} />
          {finding.contested && <Badge tone="warn">Contested</Badge>}
        </div>

        <h3 className="mt-4 text-xl font-bold leading-tight tracking-tight text-ink-900">{finding.title}</h3>

        <p className="mt-3 font-serif text-[1.0625rem] leading-relaxed text-ink-700">{finding.explanation}</p>

        {finding.evidence && (
          <div className="mt-5 border-l-4 border-ink-900 bg-bone-200 p-4">
            <div className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-ink-500">Evidence</div>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-700">{finding.evidence}</p>
          </div>
        )}

        {source && (
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-volt-600 underline underline-offset-4 hover:text-volt-700"
          >
            {source.publisher ?? source.title}
            <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 3h7v7M13 3 5 11M11 9v4H3V5h4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        )}

        {finding.contested && (
          <p className="mt-4 bg-ochre-100 px-4 py-3 text-xs leading-relaxed text-ochre-800">
            The supporting evidence is disputed or rests on lower-tier sources. Its scoring weight has been capped
            accordingly, and it is not treated as established fact.
          </p>
        )}

        <ScoreImpact impact={finding.scoreImpact} component={artistComponentLabel(finding.component)} />
      </div>
    </article>
  );
}

function ScoreImpact({ impact, component }: { impact: number; component: string }) {
  if (impact === 0) return null;
  const positive = impact > 0;

  return (
    <div className="mt-5 flex items-center gap-2.5 border-t-2 border-ink-900 pt-4 text-xs font-bold uppercase tracking-[0.1em] text-ink-400">
      <span>Score impact</span>
      <span
        className={cn(
          'tnum px-2 py-0.5 text-sm font-extrabold text-white',
          positive ? 'bg-volt-500' : 'bg-flare-600',
        )}
      >
        {positive ? '+' : ''}
        {Number.isInteger(impact) ? impact : impact.toFixed(1)}
      </span>
      <span>on {component}</span>
    </div>
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
        <div className="mt-6 space-y-5">{children}</div>
      )}
    </section>
  );
}
