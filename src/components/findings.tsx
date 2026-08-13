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
 */

const SEVERITY_STYLE: Record<Severity, { concern: string; strength: string }> = {
  MINOR: { concern: 'bg-surface-100 text-ink-600 ring-line', strength: 'bg-brand-50 text-brand-700 ring-brand-100' },
  MODERATE: { concern: 'bg-amber-50 text-amber-800 ring-amber-200', strength: 'bg-brand-50 text-brand-800 ring-brand-200' },
  MAJOR: { concern: 'bg-orange-50 text-orange-900 ring-orange-200', strength: 'bg-brand-100 text-brand-900 ring-brand-300' },
  SEVERE: { concern: 'bg-red-50 text-red-900 ring-red-300', strength: 'bg-brand-100 text-brand-900 ring-brand-300' },
};

const ACCENT: Record<Severity, string> = {
  MINOR: 'before:bg-line-strong',
  MODERATE: 'before:bg-amber-300',
  MAJOR: 'before:bg-orange-400',
  SEVERE: 'before:bg-red-500',
};

export function SongFindingItem({ finding }: { finding: SongFinding }) {
  const isConcern = finding.type === 'CONCERN';

  return (
    <article
      className={cn(
        'relative overflow-hidden rounded-xl border border-line bg-surface-0 p-5 pl-6',
        'before:absolute before:inset-y-0 before:left-0 before:w-1',
        isConcern ? ACCENT[finding.severity] : 'before:bg-brand-400',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge type={finding.type} severity={finding.severity} />
        <Badge tone="muted">{finding.category}</Badge>
        {isConcern && finding.centrality === 'CORE' && <Badge tone="warn">Core doctrine</Badge>}
        {isConcern && finding.recurring && <Badge tone="muted">Recurring</Badge>}
      </div>

      <h3 className="mt-3 text-[1.0625rem] font-semibold leading-snug text-ink-900">{finding.title}</h3>

      <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-600">{finding.explanation}</p>

      {finding.lyricExcerpt && (
        <figure className="mt-4">
          <blockquote className="border-l-2 border-line-strong pl-3.5 font-serif text-[0.9375rem] italic leading-relaxed text-ink-600">
            “{finding.lyricExcerpt}”
          </blockquote>
          <figcaption className="mt-1.5 pl-3.5 text-xs text-ink-400">
            Lyric excerpt — quoted briefly for analysis
          </figcaption>
        </figure>
      )}

      {finding.scriptureReference && (
        <div className="mt-4 rounded-lg bg-surface-50 p-4">
          <div className="eyebrow">Biblical basis</div>
          <p className="mt-1.5 text-sm font-medium text-brand-800">{finding.scriptureReference}</p>
          {finding.scriptureExcerpt && (
            <p className="scripture mt-2.5 text-sm">
              {finding.scriptureExcerpt}
              <span className="ml-1 not-italic text-xs text-ink-400">ESV</span>
            </p>
          )}
          {finding.scriptureRationale && (
            <p className="mt-2.5 text-sm leading-relaxed text-ink-600">{finding.scriptureRationale}</p>
          )}
        </div>
      )}

      <ScoreImpact impact={finding.scoreImpact} component={componentLabel(finding.component)} />
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
    <article
      className={cn(
        'relative overflow-hidden rounded-xl border border-line bg-surface-0 p-5 pl-6',
        'before:absolute before:inset-y-0 before:left-0 before:w-1',
        isConcern ? ACCENT[finding.severity] : 'before:bg-brand-400',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge type={finding.type} severity={finding.severity} />
        <Badge tone="muted">{finding.category}</Badge>
        <EvidenceGradeBadge grade={finding.evidenceGrade} />
        {finding.contested && <Badge tone="warn">Contested</Badge>}
      </div>

      <h3 className="mt-3 text-[1.0625rem] font-semibold leading-snug text-ink-900">{finding.title}</h3>

      <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-600">{finding.explanation}</p>

      {finding.evidence && (
        <div className="mt-4 rounded-lg bg-surface-50 p-4">
          <div className="eyebrow">Evidence</div>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{finding.evidence}</p>
        </div>
      )}

      {source && (
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-brand-700 underline-offset-4 hover:underline"
        >
          {source.publisher ?? source.title}
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 3h7v7M13 3 5 11M11 9v4H3V5h4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      )}

      {finding.contested && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-900">
          The supporting evidence is disputed or rests on lower-tier sources. Its scoring weight has been capped
          accordingly, and it is not treated as established fact.
        </p>
      )}

      <ScoreImpact impact={finding.scoreImpact} component={artistComponentLabel(finding.component)} />
    </article>
  );
}

function ScoreImpact({ impact, component }: { impact: number; component: string }) {
  if (impact === 0) return null;
  const positive = impact > 0;

  return (
    <div className="mt-4 flex items-center gap-2 border-t border-line pt-3 text-xs text-ink-400">
      <span>Score impact</span>
      <span className={cn('tnum font-semibold', positive ? 'text-brand-700' : 'text-ink-700')}>
        {positive ? '+' : ''}
        {Number.isInteger(impact) ? impact : impact.toFixed(1)}
      </span>
      <span>on {component}</span>
    </div>
  );
}

function SeverityBadge({ type, severity }: { type: FindingType; severity: Severity }) {
  const style = SEVERITY_STYLE[severity][type === 'CONCERN' ? 'concern' : 'strength'];
  const noun = type === 'CONCERN' ? 'concern' : 'strength';

  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', style)}>
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
  return (
    <Badge tone={weak ? 'warn' : 'muted'}>{EVIDENCE_LABEL[grade] ?? grade}</Badge>
  );
}

export function componentLabel(component: string): string {
  return { THEOLOGICAL: 'biblical soundness', COMMUNAL: 'congregational suitability', CLARITY: 'clarity' }[component] ?? component;
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
      <div className="flex items-baseline gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <span className="tnum text-sm text-ink-400">{count}</span>
      </div>
      <p className="mt-1.5 text-sm text-ink-500">{description}</p>

      {count === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-line-strong bg-surface-50 px-5 py-8 text-center text-sm text-ink-500">
          {emptyMessage}
        </p>
      ) : (
        <div className="mt-5 space-y-4">{children}</div>
      )}
    </section>
  );
}
