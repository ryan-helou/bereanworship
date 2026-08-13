import { describe, expect, it } from 'vitest';
import {
  BASELINE,
  CONCERN_PENALTY,
  MAX_STRENGTH_CREDIT,
  OVERALL_CEILING_ON_MAJOR,
  OVERALL_CEILING_ON_SEVERE,
  RECURRENCE_MULTIPLIER,
  SEVERITY_CEILING,
  SONG_WEIGHTS,
  artistFindingImpact,
  classifyRecommendation,
  effectiveArtistSeverity,
  scoreArtist,
  scoreBand,
  scoreLabel,
  scoreSong,
  severityLabel,
  songFindingImpact,
  type ScorableSongFinding,
} from '@/lib/scoring';

/**
 * The scoring engine is the one place where a silent regression would corrupt
 * every number on the site, so it is tested exhaustively — including the
 * behaviours that exist specifically to stop a weighted average being too
 * forgiving.
 */

const strength = (over: Partial<ScorableSongFinding> = {}): ScorableSongFinding => ({
  type: 'STRENGTH',
  component: 'THEOLOGICAL',
  severity: 'MODERATE',
  ...over,
});

const concern = (over: Partial<ScorableSongFinding> = {}): ScorableSongFinding => ({
  type: 'CONCERN',
  component: 'THEOLOGICAL',
  severity: 'MINOR',
  centrality: 'IMPORTANT',
  recurring: false,
  ...over,
});

describe('weights', () => {
  it('song component weights are 60/20/20 and sum to 1', () => {
    expect(SONG_WEIGHTS.THEOLOGICAL).toBe(0.6);
    expect(SONG_WEIGHTS.COMMUNAL).toBe(0.2);
    expect(SONG_WEIGHTS.CLARITY).toBe(0.2);
    const sum = SONG_WEIGHTS.THEOLOGICAL + SONG_WEIGHTS.COMMUNAL + SONG_WEIGHTS.CLARITY;
    expect(sum).toBeCloseTo(1, 10);
  });
});

describe('finding impact', () => {
  it('applies the centrality multiplier to concerns', () => {
    const core = songFindingImpact(concern({ severity: 'MODERATE', centrality: 'CORE' }));
    const important = songFindingImpact(concern({ severity: 'MODERATE', centrality: 'IMPORTANT' }));
    const peripheral = songFindingImpact(concern({ severity: 'MODERATE', centrality: 'PERIPHERAL' }));

    expect(core).toBe(-CONCERN_PENALTY.MODERATE);
    expect(important).toBe(-CONCERN_PENALTY.MODERATE * 0.75);
    expect(peripheral).toBe(-CONCERN_PENALTY.MODERATE * 0.5);
    // A core-doctrine problem must always hurt more than a peripheral one.
    expect(Math.abs(core)).toBeGreaterThan(Math.abs(peripheral));
  });

  it('amplifies recurring concerns', () => {
    const once = songFindingImpact(concern({ severity: 'MAJOR', centrality: 'CORE' }));
    const repeated = songFindingImpact(concern({ severity: 'MAJOR', centrality: 'CORE', recurring: true }));
    expect(repeated).toBeCloseTo(once * RECURRENCE_MULTIPLIER, 5);
  });

  it('scales penalties monotonically with severity', () => {
    const impacts = (['MINOR', 'MODERATE', 'MAJOR', 'SEVERE'] as const).map((severity) =>
      Math.abs(songFindingImpact(concern({ severity, centrality: 'CORE' }))),
    );
    for (let i = 1; i < impacts.length; i += 1) {
      expect(impacts[i]).toBeGreaterThan(impacts[i - 1]);
    }
  });

  it('gives strengths positive impact regardless of centrality', () => {
    expect(songFindingImpact(strength({ severity: 'MAJOR' }))).toBeGreaterThan(0);
    expect(songFindingImpact(strength({ severity: 'MINOR' }))).toBeGreaterThan(0);
  });
});

describe('scoreSong', () => {
  it('scores a song with no findings at the baseline', () => {
    const result = scoreSong([]);
    expect(result.theologicalScore).toBe(BASELINE);
    expect(result.communalScore).toBe(BASELINE);
    expect(result.clarityScore).toBe(BASELINE);
    expect(result.overallScore).toBe(BASELINE);
  });

  it('applies the 60/20/20 weighting', () => {
    // Push theology up and clarity down, then verify the arithmetic exactly.
    const result = scoreSong([
      strength({ component: 'THEOLOGICAL', severity: 'MAJOR' }),
      strength({ component: 'THEOLOGICAL', severity: 'MAJOR' }),
      concern({ component: 'CLARITY', severity: 'MODERATE', centrality: 'PERIPHERAL' }),
    ]);

    const expected = Math.round(
      result.theologicalScore * 0.6 + result.communalScore * 0.2 + result.clarityScore * 0.2,
    );
    expect(result.overallScore).toBe(expected);
  });

  it('caps strength credit so praise cannot inflate a score without limit', () => {
    const many = Array.from({ length: 10 }, () => strength({ severity: 'MAJOR' }));
    const result = scoreSong(many);
    expect(result.theologicalScore).toBe(BASELINE + MAX_STRENGTH_CREDIT);
    expect(result.theological.strengthCredit).toBe(MAX_STRENGTH_CREDIT);
  });

  it('never returns a score outside 0-100', () => {
    const catastrophic = Array.from({ length: 12 }, () =>
      concern({ severity: 'SEVERE', centrality: 'CORE', recurring: true }),
    );
    const result = scoreSong(catastrophic);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.theologicalScore).toBeGreaterThanOrEqual(0);
  });

  // --- The behaviour that makes the whole methodology work ----------------

  it('lets one severe error dominate a song that is otherwise excellent', () => {
    const excellentEverywhere = [
      ...Array.from({ length: 4 }, () => strength({ component: 'THEOLOGICAL', severity: 'MAJOR' })),
      ...Array.from({ length: 4 }, () => strength({ component: 'COMMUNAL', severity: 'MAJOR' })),
      ...Array.from({ length: 4 }, () => strength({ component: 'CLARITY', severity: 'MAJOR' })),
    ];

    const clean = scoreSong(excellentEverywhere);
    expect(clean.overallScore).toBeGreaterThanOrEqual(95);

    const withSevere = scoreSong([
      ...excellentEverywhere,
      concern({ component: 'THEOLOGICAL', severity: 'SEVERE', centrality: 'CORE' }),
    ]);

    // The weighted average alone would still be high; the ceiling is what
    // makes a false gospel decisive.
    expect(withSevere.theologicalScore).toBeLessThanOrEqual(SEVERITY_CEILING.SEVERE!);
    expect(withSevere.overallScore).toBeLessThanOrEqual(OVERALL_CEILING_ON_SEVERE);
    expect(withSevere.recommendation).toBe('NOT_RECOMMENDED');
  });

  it('caps a song carrying a major theological error', () => {
    const result = scoreSong([
      ...Array.from({ length: 5 }, () => strength({ component: 'THEOLOGICAL', severity: 'MAJOR' })),
      concern({ component: 'THEOLOGICAL', severity: 'MAJOR', centrality: 'CORE' }),
    ]);

    expect(result.theologicalScore).toBeLessThanOrEqual(SEVERITY_CEILING.MAJOR!);
    expect(result.overallScore).toBeLessThanOrEqual(OVERALL_CEILING_ON_MAJOR);
  });

  it('does not apply the overall ceiling for non-theological severity', () => {
    // A song can be nearly unsingable without that being a doctrinal verdict.
    const result = scoreSong([concern({ component: 'COMMUNAL', severity: 'MAJOR', centrality: 'PERIPHERAL' })]);
    expect(result.overallCeiling).toBeNull();
    expect(result.communalScore).toBeLessThanOrEqual(SEVERITY_CEILING.MAJOR!);
    expect(result.theologicalScore).toBe(BASELINE);
  });

  it('keeps components independent', () => {
    const result = scoreSong([concern({ component: 'CLARITY', severity: 'MODERATE', centrality: 'PERIPHERAL' })]);
    expect(result.theologicalScore).toBe(BASELINE);
    expect(result.communalScore).toBe(BASELINE);
    expect(result.clarityScore).toBeLessThan(BASELINE);
  });

  it('records an auditable contribution for every finding', () => {
    const findings = [strength({ severity: 'MAJOR' }), concern({ severity: 'MODERATE', centrality: 'CORE' })];
    const result = scoreSong(findings);
    expect(result.theological.contributions).toHaveLength(2);
    expect(result.theological.contributions.some((c) => c.impact > 0)).toBe(true);
    expect(result.theological.contributions.some((c) => c.impact < 0)).toBe(true);
  });

  it('is deterministic — the same findings always produce the same score', () => {
    const findings = [
      strength({ severity: 'MAJOR' }),
      concern({ severity: 'MODERATE', centrality: 'IMPORTANT', recurring: true }),
      concern({ component: 'CLARITY', severity: 'MINOR' }),
    ];
    const a = scoreSong(findings);
    const b = scoreSong([...findings].reverse());
    expect(a.overallScore).toBe(b.overallScore);
    expect(a.theologicalScore).toBe(b.theologicalScore);
  });
});

describe('classifyRecommendation', () => {
  it('recommends only when both overall and theological clear 80 with no major issue', () => {
    expect(classifyRecommendation({ overallScore: 88, theologicalScore: 90, hasSevere: false, hasMajor: false })).toBe(
      'RECOMMENDED',
    );
  });

  it('downgrades to caution below 80', () => {
    expect(classifyRecommendation({ overallScore: 79, theologicalScore: 85, hasSevere: false, hasMajor: false })).toBe(
      'RECOMMENDED_WITH_CAUTION',
    );
    expect(classifyRecommendation({ overallScore: 85, theologicalScore: 79, hasSevere: false, hasMajor: false })).toBe(
      'RECOMMENDED_WITH_CAUTION',
    );
  });

  it('downgrades on a major concern even with high scores', () => {
    expect(classifyRecommendation({ overallScore: 95, theologicalScore: 95, hasSevere: false, hasMajor: true })).toBe(
      'RECOMMENDED_WITH_CAUTION',
    );
  });

  it('refuses to recommend on a severe concern at any score', () => {
    expect(classifyRecommendation({ overallScore: 99, theologicalScore: 99, hasSevere: true, hasMajor: false })).toBe(
      'NOT_RECOMMENDED',
    );
  });

  it('refuses to recommend below 60 on either axis', () => {
    expect(classifyRecommendation({ overallScore: 59, theologicalScore: 90, hasSevere: false, hasMajor: false })).toBe(
      'NOT_RECOMMENDED',
    );
    expect(classifyRecommendation({ overallScore: 90, theologicalScore: 59, hasSevere: false, hasMajor: false })).toBe(
      'NOT_RECOMMENDED',
    );
  });
});

describe('scoreArtist', () => {
  it('weights doctrine most heavily', () => {
    const doctrineHit = scoreArtist([
      { type: 'CONCERN', component: 'DOCTRINE', severity: 'MAJOR' },
    ]);
    const contextHit = scoreArtist([
      { type: 'CONCERN', component: 'MINISTRY_CONTEXT', severity: 'MAJOR' },
    ]);
    expect(doctrineHit.overallScore).toBeLessThan(contextHit.overallScore);
  });

  it('caps a serious accusation that rests only on weak sources', () => {
    const wellEvidenced = scoreArtist([{ type: 'CONCERN', component: 'DOCTRINE', severity: 'SEVERE' }]);
    const weaklyEvidenced = scoreArtist([
      { type: 'CONCERN', component: 'DOCTRINE', severity: 'SEVERE', cappedBySourceQuality: true },
    ]);

    // §20: tier-4 evidence must not be able to establish a severe finding.
    expect(weaklyEvidenced.doctrineScore).toBeGreaterThan(wellEvidenced.doctrineScore);
    expect(artistFindingImpact({ type: 'CONCERN', component: 'DOCTRINE', severity: 'SEVERE', cappedBySourceQuality: true }))
      .toBe(-CONCERN_PENALTY.MODERATE);
  });

  it('does not apply the doctrine ceiling to a source-capped finding', () => {
    const result = scoreArtist([
      { type: 'CONCERN', component: 'DOCTRINE', severity: 'SEVERE', cappedBySourceQuality: true },
    ]);
    expect(result.overallScore).toBeGreaterThan(OVERALL_CEILING_ON_SEVERE);
  });

  /**
   * Regression guard. The source-quality cap reduces the *penalty*, but the
   * component ceiling is a separate mechanism — and it was originally keyed on
   * the stated severity. The result was that an uncorroborated blog allegation
   * still slammed the doctrine component to 25 and the overall score to 35,
   * defeating the entire point of the cap. Both mechanisms must respect it.
   */
  it('does not let a source-capped finding impose a component ceiling either', () => {
    const capped = scoreArtist([
      { type: 'CONCERN', component: 'DOCTRINE', severity: 'SEVERE', cappedBySourceQuality: true },
    ]);
    const enforced = scoreArtist([{ type: 'CONCERN', component: 'DOCTRINE', severity: 'SEVERE' }]);

    expect(enforced.doctrine.ceiling).toBe(SEVERITY_CEILING.SEVERE);
    expect(capped.doctrine.ceiling).toBeNull();
    expect(capped.doctrineScore).toBe(BASELINE - CONCERN_PENALTY.MODERATE);
    expect(capped.doctrineScore).toBeGreaterThan(enforced.doctrineScore);
  });

  it('reports effective severity separately from stated severity', () => {
    // The claim is still published as SEVERE; only its scoring weight is cut.
    expect(effectiveArtistSeverity({ type: 'CONCERN', component: 'DOCTRINE', severity: 'SEVERE' })).toBe('SEVERE');
    expect(
      effectiveArtistSeverity({
        type: 'CONCERN',
        component: 'DOCTRINE',
        severity: 'SEVERE',
        cappedBySourceQuality: true,
      }),
    ).toBe('MODERATE');
    // A minor concern is unaffected by the cap.
    expect(
      effectiveArtistSeverity({
        type: 'CONCERN',
        component: 'DOCTRINE',
        severity: 'MINOR',
        cappedBySourceQuality: true,
      }),
    ).toBe('MINOR');
  });
});

describe('score bands and labels', () => {
  it.each([
    [100, 'Excellent'],
    [90, 'Excellent'],
    [89, 'Strong'],
    [80, 'Strong'],
    [79, 'Generally Sound'],
    [70, 'Generally Sound'],
    [69, 'Mixed / Caution'],
    [60, 'Mixed / Caution'],
    [59, 'Significant Concerns'],
    [40, 'Significant Concerns'],
    [39, 'Poor'],
    [20, 'Poor'],
    [19, 'Severely Unsound'],
    [0, 'Severely Unsound'],
  ])('maps %i to "%s"', (score, label) => {
    expect(scoreLabel(score)).toBe(label);
  });

  it('covers every score from 0 to 100 with exactly one band', () => {
    for (let score = 0; score <= 100; score += 1) {
      expect(scoreBand(score), `score ${score} has no band`).not.toBeNull();
    }
  });

  it('reports an unreviewed score rather than guessing', () => {
    expect(scoreBand(null)).toBeNull();
    expect(scoreLabel(null)).toBe('Not yet reviewed');
  });

  it('labels strengths and concerns with different vocabulary', () => {
    expect(severityLabel('CONCERN', 'MAJOR')).toBe('Major');
    expect(severityLabel('STRENGTH', 'MAJOR')).toBe('Exceptional');
    expect(severityLabel('STRENGTH', 'MINOR')).toBe('Notable');
  });
});
