/**
 * BereanWorship scoring engine.
 *
 * Deterministic and auditable: the AI pipeline produces *findings* (evidence
 * plus a severity judgement); this module turns findings into numbers. No
 * model ever emits a final score directly, which is what makes every number
 * on the site explainable and reproducible.
 *
 * Song validity = 60% theological · 20% communal · 20% clarity.
 * Artist validity is computed on its own four-part scale and NEVER touches a
 * song score. See docs/SCORING.md for the public write-up.
 */

import type {
  ArtistComponent,
  Centrality,
  FindingType,
  Recommendation,
  ScoreComponent,
  Severity,
} from '@prisma/client';

export const SCORING_VERSION = '1.0.0';
export const METHODOLOGY_VERSION = '1.0.0';
export const DEFAULT_REVIEW_VERSION = 'v1.0';

/** Component weights for the overall song score. Must sum to 1. */
export const SONG_WEIGHTS: Record<ScoreComponent, number> = {
  THEOLOGICAL: 0.6,
  COMMUNAL: 0.2,
  CLARITY: 0.2,
};

/** Component weights for artist validity. Must sum to 1. */
export const ARTIST_WEIGHTS: Record<ArtistComponent, number> = {
  DOCTRINE: 0.45,
  PUBLIC_TEACHING: 0.25,
  AFFILIATIONS: 0.2,
  MINISTRY_CONTEXT: 0.1,
};

/**
 * Every component starts here. 70 is "nothing wrong, nothing remarkable" —
 * a doctrinally inoffensive but thin song lands in the low 70s, which is
 * exactly right. Substance is earned upward; error drags downward hard.
 */
export const BASELINE = 70;

/** Ceiling on the total credit strengths may contribute to one component. */
export const MAX_STRENGTH_CREDIT = 30;

/** Penalty applied per concern, before centrality and recurrence scaling. */
export const CONCERN_PENALTY: Record<Severity, number> = {
  MINOR: 4,
  MODERATE: 12,
  MAJOR: 28,
  SEVERE: 55,
};

/** Credit applied per strength. SEVERE is not a valid strength magnitude. */
export const STRENGTH_CREDIT: Record<Severity, number> = {
  MINOR: 3,
  MODERATE: 6,
  MAJOR: 10,
  SEVERE: 10,
};

/**
 * How central the affected doctrine is. A shaky metaphor about the weather
 * and a false statement about the atonement are not the same kind of problem.
 */
export const CENTRALITY_MULTIPLIER: Record<Centrality, number> = {
  CORE: 1.0,
  IMPORTANT: 0.75,
  PERIPHERAL: 0.5,
};

/** A problem sung once is not a problem sung eight times in the refrain. */
export const RECURRENCE_MULTIPLIER = 1.25;

/**
 * Hard ceilings. Weighted averages are too forgiving on their own: a song can
 * be 95% excellent and still teach something false, and the average would
 * happily hand it an 88. These caps make a serious error decisive.
 */
export const SEVERITY_CEILING: Partial<Record<Severity, number>> = {
  SEVERE: 25,
  MAJOR: 60,
};

/** A severe theological error caps the *overall* score too, not just theology. */
export const OVERALL_CEILING_ON_SEVERE = 35;
export const OVERALL_CEILING_ON_MAJOR = 70;

export interface ScorableSongFinding {
  type: FindingType;
  component: ScoreComponent;
  severity: Severity;
  centrality?: Centrality | null;
  recurring?: boolean | null;
}

export interface ScorableArtistFinding {
  type: FindingType;
  component: ArtistComponent;
  severity: Severity;
  /** Findings resting only on low-tier sources cannot carry top penalties. */
  cappedBySourceQuality?: boolean | null;
}

export interface ComponentBreakdown {
  component: string;
  baseline: number;
  strengthCredit: number;
  penalty: number;
  /** Score before severity ceilings were applied. */
  rawScore: number;
  /** Ceiling that bound this component, if any. */
  ceiling: number | null;
  score: number;
  contributions: FindingContribution[];
}

export interface FindingContribution {
  type: FindingType;
  severity: Severity;
  /** Signed points: positive for strengths, negative for concerns. */
  impact: number;
}

export interface SongScoreResult {
  theological: ComponentBreakdown;
  communal: ComponentBreakdown;
  clarity: ComponentBreakdown;
  theologicalScore: number;
  communalScore: number;
  clarityScore: number;
  /** Weighted average before overall ceilings. */
  weightedScore: number;
  overallScore: number;
  overallCeiling: number | null;
  recommendation: Recommendation;
}

export interface ArtistScoreResult {
  doctrine: ComponentBreakdown;
  publicTeaching: ComponentBreakdown;
  affiliations: ComponentBreakdown;
  ministryContext: ComponentBreakdown;
  doctrineScore: number;
  publicTeachingScore: number;
  affiliationScore: number;
  ministryContextScore: number;
  weightedScore: number;
  overallScore: number;
  recommendation: Recommendation;
}

export function clampScore(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

/** Signed point impact of a single song finding — the audit-trail number. */
export function songFindingImpact(finding: ScorableSongFinding): number {
  if (finding.type === 'STRENGTH') {
    return round2(STRENGTH_CREDIT[finding.severity]);
  }
  const base = CONCERN_PENALTY[finding.severity];
  const centrality = CENTRALITY_MULTIPLIER[finding.centrality ?? 'IMPORTANT'];
  const recurrence = finding.recurring ? RECURRENCE_MULTIPLIER : 1;
  return round2(-(base * centrality * recurrence));
}

/**
 * §20: low-quality sources must not independently establish serious
 * accusations. A finding resting only on tier-4 evidence — or graded merely as
 * an allegation — is demoted to MODERATE for *scoring* purposes, however the
 * model graded it. The finding is still published at its stated severity and
 * flagged as contested; it simply cannot carry a major penalty on its own.
 */
export function effectiveArtistSeverity(finding: ScorableArtistFinding): Severity {
  if (finding.type === 'STRENGTH') return finding.severity;
  return finding.cappedBySourceQuality && (finding.severity === 'MAJOR' || finding.severity === 'SEVERE')
    ? 'MODERATE'
    : finding.severity;
}

/** Signed point impact of a single artist finding. */
export function artistFindingImpact(finding: ScorableArtistFinding): number {
  if (finding.type === 'STRENGTH') {
    return round2(STRENGTH_CREDIT[finding.severity]);
  }
  return round2(-CONCERN_PENALTY[effectiveArtistSeverity(finding)]);
}

/**
 * `severity` is what the finding claims; `ceilingSeverity` is what it is
 * allowed to *enforce*. They differ only when a serious accusation rests on
 * weak evidence: the claim is still published at its stated severity, but it
 * must not be able to slam the score down via a hard ceiling on the strength
 * of a blog post. Without this distinction the penalty cap in
 * `artistFindingImpact` would be pointless — the ceiling would bypass it.
 */
function buildComponent(
  componentName: string,
  findings: Array<{ type: FindingType; severity: Severity; impact: number; ceilingSeverity?: Severity }>,
): ComponentBreakdown {
  let rawCredit = 0;
  let penalty = 0;
  const contributions: FindingContribution[] = [];

  for (const f of findings) {
    contributions.push({ type: f.type, severity: f.severity, impact: f.impact });
    if (f.impact >= 0) rawCredit += f.impact;
    else penalty += Math.abs(f.impact);
  }

  const strengthCredit = Math.min(rawCredit, MAX_STRENGTH_CREDIT);
  const rawScore = clampScore(BASELINE + strengthCredit - penalty);

  // Worst *enforceable* concern severity decides the ceiling.
  let ceiling: number | null = null;
  for (const f of findings) {
    if (f.type !== 'CONCERN') continue;
    const cap = SEVERITY_CEILING[f.ceilingSeverity ?? f.severity];
    if (cap !== undefined && (ceiling === null || cap < ceiling)) ceiling = cap;
  }

  const score = ceiling === null ? rawScore : Math.min(rawScore, ceiling);

  return {
    component: componentName,
    baseline: BASELINE,
    strengthCredit: round2(strengthCredit),
    penalty: round2(penalty),
    rawScore: Math.round(rawScore),
    ceiling,
    score: Math.round(score),
    contributions,
  };
}

export function scoreSong(findings: ScorableSongFinding[]): SongScoreResult {
  const byComponent: Record<ScoreComponent, Array<{ type: FindingType; severity: Severity; impact: number }>> = {
    THEOLOGICAL: [],
    COMMUNAL: [],
    CLARITY: [],
  };

  for (const f of findings) {
    byComponent[f.component].push({ type: f.type, severity: f.severity, impact: songFindingImpact(f) });
  }

  const theological = buildComponent('THEOLOGICAL', byComponent.THEOLOGICAL);
  const communal = buildComponent('COMMUNAL', byComponent.COMMUNAL);
  const clarity = buildComponent('CLARITY', byComponent.CLARITY);

  const weighted =
    theological.score * SONG_WEIGHTS.THEOLOGICAL +
    communal.score * SONG_WEIGHTS.COMMUNAL +
    clarity.score * SONG_WEIGHTS.CLARITY;

  // A severe or major *theological* error also constrains the headline number,
  // so a great tune and a singable melody cannot rescue false teaching.
  let overallCeiling: number | null = null;
  const theologicalConcerns = findings.filter((f) => f.type === 'CONCERN' && f.component === 'THEOLOGICAL');
  if (theologicalConcerns.some((f) => f.severity === 'SEVERE')) {
    overallCeiling = OVERALL_CEILING_ON_SEVERE;
  } else if (theologicalConcerns.some((f) => f.severity === 'MAJOR')) {
    overallCeiling = OVERALL_CEILING_ON_MAJOR;
  }

  const weightedScore = Math.round(weighted);
  const overallScore = overallCeiling === null ? weightedScore : Math.min(weightedScore, overallCeiling);

  return {
    theological,
    communal,
    clarity,
    theologicalScore: theological.score,
    communalScore: communal.score,
    clarityScore: clarity.score,
    weightedScore,
    overallScore,
    overallCeiling,
    recommendation: classifyRecommendation({
      overallScore,
      theologicalScore: theological.score,
      hasSevere: theologicalConcerns.some((f) => f.severity === 'SEVERE'),
      hasMajor: theologicalConcerns.some((f) => f.severity === 'MAJOR'),
    }),
  };
}

export function scoreArtist(findings: ScorableArtistFinding[]): ArtistScoreResult {
  const byComponent: Record<
    ArtistComponent,
    Array<{ type: FindingType; severity: Severity; impact: number; ceilingSeverity?: Severity }>
  > = {
    DOCTRINE: [],
    PUBLIC_TEACHING: [],
    AFFILIATIONS: [],
    MINISTRY_CONTEXT: [],
  };

  for (const f of findings) {
    byComponent[f.component].push({
      type: f.type,
      severity: f.severity,
      impact: artistFindingImpact(f),
      ceilingSeverity: effectiveArtistSeverity(f),
    });
  }

  const doctrine = buildComponent('DOCTRINE', byComponent.DOCTRINE);
  const publicTeaching = buildComponent('PUBLIC_TEACHING', byComponent.PUBLIC_TEACHING);
  const affiliations = buildComponent('AFFILIATIONS', byComponent.AFFILIATIONS);
  const ministryContext = buildComponent('MINISTRY_CONTEXT', byComponent.MINISTRY_CONTEXT);

  const weighted =
    doctrine.score * ARTIST_WEIGHTS.DOCTRINE +
    publicTeaching.score * ARTIST_WEIGHTS.PUBLIC_TEACHING +
    affiliations.score * ARTIST_WEIGHTS.AFFILIATIONS +
    ministryContext.score * ARTIST_WEIGHTS.MINISTRY_CONTEXT;

  const doctrinalConcerns = findings.filter((f) => f.type === 'CONCERN' && f.component === 'DOCTRINE');
  let overallCeiling: number | null = null;
  if (doctrinalConcerns.some((f) => f.severity === 'SEVERE' && !f.cappedBySourceQuality)) {
    overallCeiling = OVERALL_CEILING_ON_SEVERE;
  } else if (doctrinalConcerns.some((f) => f.severity === 'MAJOR' && !f.cappedBySourceQuality)) {
    overallCeiling = OVERALL_CEILING_ON_MAJOR;
  }

  const weightedScore = Math.round(weighted);
  const overallScore = overallCeiling === null ? weightedScore : Math.min(weightedScore, overallCeiling);

  return {
    doctrine,
    publicTeaching,
    affiliations,
    ministryContext,
    doctrineScore: doctrine.score,
    publicTeachingScore: publicTeaching.score,
    affiliationScore: affiliations.score,
    ministryContextScore: ministryContext.score,
    weightedScore,
    overallScore,
    recommendation: classifyRecommendation({
      overallScore,
      theologicalScore: doctrine.score,
      hasSevere: doctrinalConcerns.some((f) => f.severity === 'SEVERE' && !f.cappedBySourceQuality),
      hasMajor: doctrinalConcerns.some((f) => f.severity === 'MAJOR' && !f.cappedBySourceQuality),
    }),
  };
}

export function classifyRecommendation(input: {
  overallScore: number;
  theologicalScore: number;
  hasSevere: boolean;
  hasMajor: boolean;
}): Recommendation {
  const { overallScore, theologicalScore, hasSevere, hasMajor } = input;
  if (hasSevere || overallScore < 60 || theologicalScore < 60) return 'NOT_RECOMMENDED';
  if (hasMajor || overallScore < 80 || theologicalScore < 80) return 'RECOMMENDED_WITH_CAUTION';
  return 'RECOMMENDED';
}

export interface ScoreBand {
  min: number;
  max: number;
  label: string;
  /** Tailwind-ready semantic token, mapped to colour in the UI layer. */
  tone: 'excellent' | 'strong' | 'sound' | 'mixed' | 'concern' | 'poor' | 'unsound';
}

export const SCORE_BANDS: ScoreBand[] = [
  { min: 90, max: 100, label: 'Excellent', tone: 'excellent' },
  { min: 80, max: 89, label: 'Strong', tone: 'strong' },
  { min: 70, max: 79, label: 'Generally Sound', tone: 'sound' },
  { min: 60, max: 69, label: 'Mixed / Caution', tone: 'mixed' },
  { min: 40, max: 59, label: 'Significant Concerns', tone: 'concern' },
  { min: 20, max: 39, label: 'Poor', tone: 'poor' },
  { min: 0, max: 19, label: 'Severely Unsound', tone: 'unsound' },
];

export function scoreBand(score: number | null | undefined): ScoreBand | null {
  if (score === null || score === undefined) return null;
  const s = clampScore(score);
  return SCORE_BANDS.find((band) => s >= band.min && s <= band.max) ?? SCORE_BANDS[SCORE_BANDS.length - 1];
}

export function scoreLabel(score: number | null | undefined): string {
  return scoreBand(score)?.label ?? 'Not yet reviewed';
}

export const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  RECOMMENDED: 'Recommended',
  RECOMMENDED_WITH_CAUTION: 'Recommended with caution',
  NOT_RECOMMENDED: 'Not recommended',
};

export const RECOMMENDATION_BLURB: Record<Recommendation, string> = {
  RECOMMENDED: 'Generally suitable for corporate worship.',
  RECOMMENDED_WITH_CAUTION: 'Meaningful concerns exist and should be considered.',
  NOT_RECOMMENDED:
    'Significant theological or congregational concerns make this song unsuitable for corporate worship.',
};

/** Presentation label for a finding weight — concerns and strengths read differently. */
export function severityLabel(type: FindingType, severity: Severity): string {
  if (type === 'STRENGTH') {
    return { MINOR: 'Notable', MODERATE: 'Strong', MAJOR: 'Exceptional', SEVERE: 'Exceptional' }[severity];
  }
  return { MINOR: 'Minor', MODERATE: 'Moderate', MAJOR: 'Major', SEVERE: 'Severe' }[severity];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
