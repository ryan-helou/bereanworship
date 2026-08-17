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

export const SCORING_VERSION = '3.0.0';
export const METHODOLOGY_VERSION = '3.0.0';
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
 * Baseline for **artist** scoring only. Songs no longer use it.
 *
 * It was the baseline for songs too until it was tested rather than read, and
 * failed four ways: a song with no findings scored 70 and was "recommended
 * with caution"; three exceptional strengths and eight both scored 100; two
 * moderate concerns ranked worse than one major one; and a song with two
 * documented concerns scored below a song nobody had looked at. The root fault
 * was that 70 answered both "unremarkable but fine" and "no evidence at all".
 *
 * Songs are now judged against a rubric (see below and docs/SCORING-RUBRIC.md).
 * Artist research still uses this model — it has the same weakness, and needs
 * its own rubric written before it can move.
 */
export const BASELINE = 70;

/** Artist scoring only: ceiling on the credit strengths may contribute. */
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

/** A severe doctrinal error caps the *overall* artist score too. */
export const OVERALL_CEILING_ON_SEVERE = 35;
export const OVERALL_CEILING_ON_MAJOR = 70;

// ---------------------------------------------------------------------------
// Song rubric
// ---------------------------------------------------------------------------

/**
 * Songs are scored against a criterion-referenced rubric: eleven levels per
 * criterion, six of them carrying written anchors on the methodology page, with
 * the odd levels used for songs sitting between two descriptions. The level is
 * selected by the findings, not accumulated from them.
 *
 *     level = min(ceiling, merit)
 *
 * Ceiling is what the flaws allow, set by the single worst concern rather than
 * by their sum — which is what makes severity ordinal instead of additive, and
 * why this model needs no separate ceiling table to override its own answer.
 * Merit is what the substance earns, set by the best strength and raised for
 * breadth. Full reasoning in docs/SCORING-RUBRIC.md.
 */
export const RUBRIC_MAX_LEVEL = 10;

/** What the single worst concern allows a criterion to reach. */
export const LEVEL_CEILING: Record<Severity, number> = {
  MINOR: 9,
  MODERATE: 7,
  MAJOR: 4,
  SEVERE: 1,
};

/** What the best strength earns, before the breadth bonuses. */
export const LEVEL_MERIT: Record<Severity, number> = {
  MINOR: 6,
  MODERATE: 7,
  MAJOR: 8,
  SEVERE: 8,
};

/** A criterion with strengths but no concerns, and nothing outstanding, sits here. */
export const MERIT_WITHOUT_STRENGTHS = 5;

// ---------------------------------------------------------------------------
// Biblical soundness and substance — the two doctrinal axes
// ---------------------------------------------------------------------------

/**
 * Two questions, not one.
 *
 * "How wrong is anything here?" and "how much is here at all?" are different,
 * and 2.0.0 answered both with a single rubric level. A song can be flawless
 * and empty, or rich and broken, and the two failures should not look alike.
 *
 *   SOUNDNESS — set by the single worst thing the song gets WRONG. One bad
 *               line is meant to hurt badly however good the rest is, so the
 *               worst finding sets the level outright.
 *   SUBSTANCE — a fixed checklist of what the song gives a congregation.
 *
 * The lower axis binds and the higher one lifts a little, so neither can
 * rescue the other: an empty song stays mediocre however clean, and a rich
 * song with a bad line still falls.
 *
 * An **absence is not a concern**. "Never mentions the cross" is a zero on the
 * checklist, not a fault lowering soundness — filing it as both penalised a
 * song twice for one gap.
 */
const SOUNDNESS_BASE: Record<Severity, number> = { MINOR: 9, MODERATE: 6, MAJOR: 3, SEVERE: 0 };

/** How much the better axis may lift the worse one. */
export const SUBSTANCE_LIFT = 0.35;

/** Each checklist test, and what it is worth. Total 10. */
export const SUBSTANCE_TESTS = [
  { key: 'namesGod', points: 1, label: 'Names God or Christ specifically' },
  { key: 'statesAnAct', points: 2, label: 'States something God has done' },
  { key: 'teachesDoctrine', points: 2, label: 'Teaches doctrine, not just feeling' },
  { key: 'groundsClaims', points: 2, label: "Grounds its claims in God's character or acts" },
  { key: 'engagesScripture', points: 1, label: 'Engages a passage directly' },
  { key: 'beyondTheSelf', points: 1, label: "Moves beyond the singer's experience" },
  { key: 'saysSomethingNew', points: 1, label: 'Says something a congregation did not know' },
] as const;

export type SubstanceKey = (typeof SUBSTANCE_TESTS)[number]['key'];
export type SubstanceAnswers = Partial<Record<SubstanceKey, boolean | null>>;

export interface SoundnessResult {
  level: number;
  /** The finding that set it, or null when nothing is wrong. */
  setBy: ScorableSongFinding | null;
  /** True when a major or severe error is present, which forces the verdict. */
  disqualifying: boolean;
}

/**
 * Soundness, set by the worst thing the song gets wrong.
 *
 * Severity supplies the base; centrality, likelihood and recurrence each move
 * it by one. A moderate error about a core doctrine that an ordinary singer
 * would take, sung every chorus, lands at 3 — which is the intended weight of
 * "one bad line".
 */
export function scoreSoundness(findings: ScorableSongFinding[]): SoundnessResult {
  const concerns = findings.filter((f) => f.type === 'CONCERN');
  if (concerns.length === 0) return { level: RUBRIC_MAX_LEVEL, setBy: null, disqualifying: false };

  let worst: { level: number; finding: ScorableSongFinding } | null = null;
  for (const f of concerns) {
    let n = SOUNDNESS_BASE[f.severity];
    if ((f.centrality ?? 'IMPORTANT') === 'CORE') n -= 1;
    if ((f.centrality ?? 'IMPORTANT') === 'PERIPHERAL') n += 1;
    if ((f.likelihood ?? 'POSSIBLE') === 'LIKELY') n -= 1;
    if (f.recurring) n -= 1;
    n = clampLevel(n);
    if (worst === null || n < worst.level) worst = { level: n, finding: f };
  }

  return {
    level: worst!.level,
    setBy: worst!.finding,
    // A major or severe error is decisive on its own, whatever the arithmetic
    // says about the rest of the song.
    disqualifying: concerns.some((f) => f.severity === 'MAJOR' || f.severity === 'SEVERE'),
  };
}

export interface SubstanceResult {
  level: number;
  passed: SubstanceKey[];
  failed: SubstanceKey[];
  /** True when the checklist was never filled in — a review from before 3.0.0. */
  unassessed: boolean;
}

export function scoreSubstance(answers: SubstanceAnswers | null | undefined): SubstanceResult {
  if (!answers || SUBSTANCE_TESTS.every((t) => answers[t.key] === null || answers[t.key] === undefined)) {
    return { level: 0, passed: [], failed: [], unassessed: true };
  }

  const passed = SUBSTANCE_TESTS.filter((t) => answers[t.key] === true);
  const failed = SUBSTANCE_TESTS.filter((t) => answers[t.key] !== true);

  return {
    level: passed.reduce((n, t) => n + t.points, 0),
    passed: passed.map((t) => t.key),
    failed: failed.map((t) => t.key),
    unassessed: false,
  };
}

/** The lower axis binds; the higher lifts it by a fraction of the gap. */
export function combineAxes(soundness: number, substance: number): number {
  const lo = Math.min(soundness, substance);
  const hi = Math.max(soundness, substance);
  return lo + (hi - lo) * SUBSTANCE_LIFT;
}

const SEVERITY_RANK: Record<Severity, number> = { MINOR: 1, MODERATE: 2, MAJOR: 3, SEVERE: 4 };

const clampLevel = (n: number) => Math.max(0, Math.min(RUBRIC_MAX_LEVEL, n));

/**
 * The two findings that decide a criterion.
 *
 * Exported because the page marks them in the findings list, and a second
 * implementation of the tie-break is exactly how a UI comes to disagree with
 * the scorer it is supposed to be explaining. Ties go to the finding the
 * reviewer wrote first.
 */
export function worstConcern<T extends ScorableSongFinding>(findings: T[]): T | null {
  const concerns = findings.filter((f) => f.type === 'CONCERN');
  if (concerns.length === 0) return null;
  return concerns.reduce((worst, f) => (SEVERITY_RANK[f.severity] > SEVERITY_RANK[worst.severity] ? f : worst));
}

export function bestStrength<T extends ScorableSongFinding>(findings: T[]): T | null {
  const strengths = findings.filter((f) => f.type === 'STRENGTH');
  if (strengths.length === 0) return null;
  return strengths.reduce((best, f) => (SEVERITY_RANK[f.severity] > SEVERITY_RANK[best.severity] ? f : best));
}

export interface RubricDecider {
  severity: Severity;
  centrality: Centrality;
  recurring: boolean;
}

export interface ComponentRubric {
  component: string;
  /** null when the criterion had no findings — unrated, not zero. */
  level: number | null;
  ceiling: number | null;
  merit: number | null;
  /** The concern that set the ceiling, and the strength that set merit. */
  ceilingSetBy: RubricDecider | null;
  meritSetBy: RubricDecider | null;
  /** True when the ceiling bound the level, so further strengths changed nothing. */
  ceilingBinds: boolean;
  strengthCount: number;
  concernCount: number;
  /** level × 10, or null when unrated. */
  score: number | null;
}

/**
 * Places one criterion on the rubric.
 *
 * No findings means **unrated**, not a default. That is the whole point of the
 * change: absence of evidence and evidence of adequacy are different states,
 * and a song nobody can say anything about should not receive a passing number.
 */
export function rateComponent(componentName: string, findings: ScorableSongFinding[]): ComponentRubric {
  const strengths = findings.filter((f) => f.type === 'STRENGTH');
  const concerns = findings.filter((f) => f.type === 'CONCERN');

  if (findings.length === 0) {
    return {
      component: componentName,
      level: null,
      ceiling: null,
      merit: null,
      ceilingSetBy: null,
      meritSetBy: null,
      ceilingBinds: false,
      strengthCount: 0,
      concernCount: 0,
      score: null,
    };
  }

  let ceiling = RUBRIC_MAX_LEVEL;
  let ceilingSetBy: RubricDecider | null = null;

  if (concerns.length > 0) {
    const worst = worstConcern(findings)!;
    const centrality = worst.centrality ?? 'IMPORTANT';
    const recurring = Boolean(worst.recurring);
    ceilingSetBy = { severity: worst.severity, centrality, recurring };

    ceiling = LEVEL_CEILING[worst.severity];
    // A central error sung every chorus is worse than the same error sung once;
    // a matter of imagery should not hold a song down like a doctrinal fault.
    if (centrality === 'CORE' && recurring) ceiling -= 1;
    if (centrality === 'PERIPHERAL') ceiling += 1;
    ceiling = clampLevel(ceiling);
  }

  let merit = MERIT_WITHOUT_STRENGTHS;
  let meritSetBy: RubricDecider | null = null;

  if (strengths.length > 0) {
    const best = bestStrength(findings)!;
    meritSetBy = { severity: best.severity, centrality: best.centrality ?? 'IMPORTANT', recurring: false };

    merit = LEVEL_MERIT[best.severity];
    if (strengths.length >= 3) merit += 1;
    if (strengths.length >= 5 && strengths.filter((s) => s.severity === 'MAJOR').length >= 2) merit += 1;
    merit = clampLevel(merit);
  }

  const level = Math.min(ceiling, merit);

  return {
    component: componentName,
    level,
    ceiling,
    merit,
    ceilingSetBy,
    meritSetBy,
    ceilingBinds: ceiling < merit,
    strengthCount: strengths.length,
    concernCount: concerns.length,
    score: level * 10,
  };
}

export interface ScorableSongFinding {
  type: FindingType;
  component: ScoreComponent;
  severity: Severity;
  centrality?: Centrality | null;
  recurring?: boolean | null;
  /** 'LIKELY' | 'POSSIBLE' — whether an ordinary singer takes the wrong meaning. */
  likelihood?: string | null;
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
  theological: ComponentRubric;
  communal: ComponentRubric;
  clarity: ComponentRubric;
  /** The two doctrinal axes behind `theological`. */
  soundness: SoundnessResult;
  substance: SubstanceResult;
  /** Each is level × 10, or null when that criterion had nothing to judge. */
  theologicalScore: number | null;
  communalScore: number | null;
  clarityScore: number | null;
  /** Weighted average of the rated criteria, before the doctrine cap. */
  weightedScore: number | null;
  overallScore: number | null;
  /** Set when biblical soundness capped the total below the weighted average. */
  overallCeiling: number | null;
  /** Criteria excluded from the average because they had no findings. */
  unrated: ScoreComponent[];
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

export function scoreSong(
  findings: ScorableSongFinding[],
  substanceAnswers?: SubstanceAnswers | null,
): SongScoreResult {
  const theologicalFindings = findings.filter((f) => f.component === 'THEOLOGICAL');

  // Biblical soundness runs on the two doctrinal axes. Communal and clarity
  // keep the 2.0.0 rubric: singability is a different kind of question and is
  // not improved by asking what a song teaches.
  const soundness = scoreSoundness(theologicalFindings);
  const substance = scoreSubstance(substanceAnswers);

  const theological: ComponentRubric = substance.unassessed
    ? // Pre-3.0.0 review: fall back to the rubric so old rows still render.
      rateComponent('THEOLOGICAL', theologicalFindings)
    : {
        component: 'THEOLOGICAL',
        level: Math.round(combineAxes(soundness.level, substance.level)),
        ceiling: soundness.level,
        merit: substance.level,
        ceilingSetBy: soundness.setBy
          ? {
              severity: soundness.setBy.severity,
              centrality: soundness.setBy.centrality ?? 'IMPORTANT',
              recurring: Boolean(soundness.setBy.recurring),
            }
          : null,
        meritSetBy: null,
        ceilingBinds: soundness.level < substance.level,
        strengthCount: theologicalFindings.filter((f) => f.type === 'STRENGTH').length,
        concernCount: theologicalFindings.filter((f) => f.type === 'CONCERN').length,
        score: Math.round(combineAxes(soundness.level, substance.level)) * 10,
      };

  const communal = rateComponent('COMMUNAL', findings.filter((f) => f.component === 'COMMUNAL'));
  const clarity = rateComponent('CLARITY', findings.filter((f) => f.component === 'CLARITY'));

  const rated: Array<[ScoreComponent, ComponentRubric]> = (
    [
      ['THEOLOGICAL', theological],
      ['COMMUNAL', communal],
      ['CLARITY', clarity],
    ] as Array<[ScoreComponent, ComponentRubric]>
  ).filter(([, r]) => r.level !== null);

  const unrated = (['THEOLOGICAL', 'COMMUNAL', 'CLARITY'] as ScoreComponent[]).filter(
    (c) => !rated.some(([key]) => key === c),
  );

  // Unrated criteria drop out and the remaining weights renormalise, so a
  // missing criterion neither counts as zero nor quietly counts as adequate.
  if (rated.length === 0) {
    return {
      theological,
      communal,
      clarity,
      soundness,
      substance,
      theologicalScore: null,
      communalScore: null,
      clarityScore: null,
      weightedScore: null,
      overallScore: null,
      overallCeiling: null,
      unrated,
      recommendation: 'NOT_RECOMMENDED',
    };
  }

  const totalWeight = rated.reduce((n, [key]) => n + SONG_WEIGHTS[key], 0);
  const weighted = rated.reduce((n, [key, r]) => n + r.score! * (SONG_WEIGHTS[key] / totalWeight), 0);
  const weightedScore = Math.round(weighted);

  // Doctrine caps the total. One rule replaces the two ceiling tables the
  // additive model needed to override its own answer: a singable, clear song
  // cannot average its way past bad teaching.
  const doctrineCap = theological.score;
  const overallScore =
    doctrineCap === null ? weightedScore : Math.min(weightedScore, doctrineCap);

  return {
    theological,
    communal,
    clarity,
    soundness,
    substance,
    theologicalScore: theological.score,
    communalScore: communal.score,
    clarityScore: clarity.score,
    weightedScore,
    overallScore,
    overallCeiling: doctrineCap !== null && doctrineCap < weightedScore ? doctrineCap : null,
    unrated,
    recommendation: classifySongRecommendation(overallScore, theological.level, soundness.disqualifying),
  };
}

/**
 * Song verdicts read off the rubric rather than off score thresholds.
 *
 * The biblical level is decisive on its own: level 2 is "a significant error
 * about something central", and no overall average should be able to call that
 * recommendable.
 */
export function classifySongRecommendation(
  overallScore: number | null,
  theologicalLevel: number | null,
  disqualifying = false,
): Recommendation {
  if (overallScore === null) return 'NOT_RECOMMENDED';
  // A major or severe doctrinal error settles the verdict by itself. No
  // arithmetic over the rest of the song is allowed to overturn it, because
  // the question a worship leader is asking is not "how good on balance" but
  // "can we put this in our congregation's mouth".
  if (disqualifying) return 'NOT_RECOMMENDED';
  if (theologicalLevel !== null && theologicalLevel <= 2) return 'NOT_RECOMMENDED';
  // 50 rather than 60. Splitting soundness from substance moved the whole
  // distribution down — a thin song now scores its thinness instead of
  // collecting a baseline — and leaving the old threshold in place would have
  // flipped several songs to "not recommended" on arithmetic drift alone.
  // That verdict is for songs a congregation should not be given, which is
  // what the disqualifying rule above is for.
  if (overallScore < 50) return 'NOT_RECOMMENDED';
  if ((theologicalLevel !== null && theologicalLevel <= 4) || overallScore < 80) return 'RECOMMENDED_WITH_CAUTION';
  return 'RECOMMENDED';
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

// ---------------------------------------------------------------------------
// Vocal range
// ---------------------------------------------------------------------------

/**
 * Congregational range difficulty, scored 0-100 from measured pitches.
 *
 * Reported separately from song validity and deliberately NOT folded into it.
 * The reason is that range is not a property of the song — it is a property of
 * the key you play it in. Transpose down a tone and the same song becomes
 * singable. Baking that into a permanent theological verdict would be a
 * category error, and would also mean a doctrinally excellent hymn scored
 * badly for a decision the worship leader can simply make differently.
 *
 * Direction: higher is EASIER, so it reads the same way as every other number
 * on the site. The difficulty band is shown alongside it so the figure is not
 * ambiguous.
 *
 * Only ever computed from measured pitches taken off a chart or score. There
 * is no estimate path: an unmeasured song reports null and says so.
 */

/** Below this, untrained voices lose power and drop out. */
export const CONGREGATIONAL_LOW = 57; // A3
/** Above this, most mixed congregations strain or stop singing. */
export const CONGREGATIONAL_HIGH = 74; // D5
/** Sustained singing above this tires a congregation even when reachable. */
export const TESSITURA_CEILING = 72; // C5
/** A span most people can manage without thinking about it. */
export const COMFORTABLE_SPAN = 12; // one octave

const PENALTY_PER_SEMITONE = {
  /** A wide song is harder even when it sits in a good place. */
  span: 3,
  /** Notes above the ceiling cost most — this is where singing stops. */
  aboveHigh: 6,
  /** Low notes cost less: people drop an octave or go quiet, not silent. */
  belowLow: 4,
  /** Sitting high is worse than touching high once. */
  tessitura: 4,
} as const;

const NOTE_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * Scientific pitch notation to MIDI number. C4 is middle C (60).
 * Accepts sharps and flats, ASCII or Unicode. Returns null if unparseable —
 * bad data must not silently become a score.
 */
export function noteToMidi(note: string | null | undefined): number | null {
  if (!note) return null;
  const match = /^\s*([A-Ga-g])\s*([#b♯♭]?)\s*(-?\d{1,2})\s*$/.exec(note);
  if (!match) return null;

  const base = NOTE_SEMITONES[match[1].toUpperCase()];
  if (base === undefined) return null;

  const accidental = match[2] === '#' || match[2] === '♯' ? 1 : match[2] === 'b' || match[2] === '♭' ? -1 : 0;
  const octave = Number.parseInt(match[3], 10);
  const midi = 12 * (octave + 1) + base + accidental;

  return midi >= 0 && midi <= 127 ? midi : null;
}

/**
 * Tidies a pitch for display without changing its spelling.
 *
 * Deliberately does NOT round-trip through MIDI. Bb and A# are the same pitch
 * but not the same note: a song in Eb is written with Bb and Eb, and showing a
 * musician "A#3-D#5" for it looks wrong even though it sounds identical. The
 * MIDI value does the scoring; the measured spelling does the displaying.
 */
export function tidyNote(note: string): string {
  return note
    .trim()
    .replace(/\s+/g, '')
    .replace(/♯/g, '#')
    .replace(/♭/g, 'b')
    .replace(/^([a-g])/, (m) => m.toUpperCase());
}

export function midiToNote(midi: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export interface VocalRangeInput {
  /** Lowest melody note, scientific pitch notation, e.g. "A3". */
  lowest: string | null | undefined;
  /** Highest melody note, e.g. "D5". */
  highest: string | null | undefined;
  /** Optional: where the melody mostly sits, which matters more than extremes. */
  tessituraLow?: string | null;
  tessituraHigh?: string | null;
}

export interface VocalRangeResult {
  score: number;
  label: string;
  /** Semitones from lowest to highest. */
  span: number;
  lowest: string;
  highest: string;
  /** Signed deductions, so the number is auditable like every other score. */
  deductions: Array<{ reason: string; points: number }>;
}

export const RANGE_BANDS = [
  { min: 85, max: 100, label: 'Easy' },
  { min: 70, max: 84, label: 'Comfortable' },
  { min: 55, max: 69, label: 'Demanding' },
  { min: 40, max: 54, label: 'Difficult' },
  { min: 0, max: 39, label: 'Very difficult' },
] as const;

export function rangeLabel(score: number | null | undefined): string | null {
  if (score === null || score === undefined) return null;
  const s = clampScore(score);
  return (RANGE_BANDS.find((b) => s >= b.min && s <= b.max) ?? RANGE_BANDS[RANGE_BANDS.length - 1]).label;
}

/**
 * Returns null when the pitches are missing or unparseable. There is
 * deliberately no fallback estimate: a guessed range is worse than an honest
 * blank, because a worship leader would act on it.
 */
export function scoreVocalRange(input: VocalRangeInput): VocalRangeResult | null {
  const low = noteToMidi(input.lowest);
  const high = noteToMidi(input.highest);
  if (low === null || high === null || high < low) return null;

  const span = high - low;
  const deductions: Array<{ reason: string; points: number }> = [];

  const spanExcess = Math.max(0, span - COMFORTABLE_SPAN);
  if (spanExcess > 0) {
    deductions.push({
      reason: `${spanExcess} semitone${spanExcess === 1 ? '' : 's'} wider than an octave`,
      points: spanExcess * PENALTY_PER_SEMITONE.span,
    });
  }

  const aboveHigh = Math.max(0, high - CONGREGATIONAL_HIGH);
  if (aboveHigh > 0) {
    deductions.push({
      reason: `reaches ${aboveHigh} semitone${aboveHigh === 1 ? '' : 's'} above ${midiToNote(CONGREGATIONAL_HIGH)}`,
      points: aboveHigh * PENALTY_PER_SEMITONE.aboveHigh,
    });
  }

  const belowLow = Math.max(0, CONGREGATIONAL_LOW - low);
  if (belowLow > 0) {
    deductions.push({
      reason: `drops ${belowLow} semitone${belowLow === 1 ? '' : 's'} below ${midiToNote(CONGREGATIONAL_LOW)}`,
      points: belowLow * PENALTY_PER_SEMITONE.belowLow,
    });
  }

  const tessHigh = noteToMidi(input.tessituraHigh);
  if (tessHigh !== null) {
    const excess = Math.max(0, tessHigh - TESSITURA_CEILING);
    if (excess > 0) {
      deductions.push({
        reason: `melody sits ${excess} semitone${excess === 1 ? '' : 's'} above ${midiToNote(TESSITURA_CEILING)}`,
        points: excess * PENALTY_PER_SEMITONE.tessitura,
      });
    }
  }

  const score = Math.round(clampScore(100 - deductions.reduce((sum, d) => sum + d.points, 0)));

  return {
    score,
    label: rangeLabel(score)!,
    span,
    // Echo the measured spelling rather than re-deriving from MIDI, so a song
    // in a flat key is not displayed in sharps.
    lowest: tidyNote(input.lowest!),
    highest: tidyNote(input.highest!),
    deductions,
  };
}
