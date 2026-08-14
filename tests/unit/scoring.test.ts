import { describe, expect, it } from 'vitest';
import {
  BASELINE,
  CONCERN_PENALTY,
  OVERALL_CEILING_ON_SEVERE,
  RECURRENCE_MULTIPLIER,
  SEVERITY_CEILING,
  RUBRIC_MAX_LEVEL,
  SONG_WEIGHTS,
  artistFindingImpact,
  bestStrength,
  classifyRecommendation,
  classifySongRecommendation,
  effectiveArtistSeverity,
  scoreArtist,
  scoreBand,
  scoreLabel,
  scoreSong,
  severityLabel,
  songFindingImpact,
  worstConcern,
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

describe('scoreSong — the rubric', () => {
  /**
   * Each case below was a failure of the baseline-70 model it replaced. The
   * old behaviour is named in the test so a future change that reintroduces it
   * fails loudly rather than looking like a tuning decision.
   */

  it('leaves a criterion with no findings unrated, rather than scoring it', () => {
    // Was: 70/70/70, overall 70, "recommended with caution".
    const result = scoreSong([]);
    expect(result.theologicalScore).toBeNull();
    expect(result.communalScore).toBeNull();
    expect(result.clarityScore).toBeNull();
    expect(result.overallScore).toBeNull();
    expect(result.unrated).toEqual(['THEOLOGICAL', 'COMMUNAL', 'CLARITY']);
    expect(result.recommendation).toBe('NOT_RECOMMENDED');
  });

  it('drops an unrated criterion from the average and renormalises the rest', () => {
    // Theology and clarity rated, communal silent: the overall must be the
    // weighted average of the two that exist, not a third of nothing.
    const result = scoreSong([
      strength({ component: 'THEOLOGICAL', severity: 'MAJOR' }),
      strength({ component: 'CLARITY', severity: 'MAJOR' }),
    ]);

    expect(result.communalScore).toBeNull();
    expect(result.unrated).toEqual(['COMMUNAL']);

    const expected = Math.round(
      (result.theologicalScore! * SONG_WEIGHTS.THEOLOGICAL + result.clarityScore! * SONG_WEIGHTS.CLARITY) /
        (SONG_WEIGHTS.THEOLOGICAL + SONG_WEIGHTS.CLARITY),
    );
    expect(result.overallScore).toBe(expected);
  });

  it('distinguishes three strengths from eight', () => {
    // Was: both exactly 100, because credit capped at +30.
    const three = scoreSong(Array.from({ length: 3 }, () => strength({ severity: 'MAJOR' })));
    const eight = scoreSong(Array.from({ length: 8 }, () => strength({ severity: 'MAJOR' })));
    expect(eight.theologicalScore).toBeGreaterThan(three.theologicalScore!);
  });

  it('ranks one major concern below two moderate ones', () => {
    // Was: 49 vs 52 — a major doctrinal error scored better than two
    // moderate imprecisions, because penalties simply added up.
    const twoModerate = scoreSong([
      concern({ severity: 'MODERATE' }),
      concern({ severity: 'MODERATE' }),
    ]);
    const oneMajor = scoreSong([concern({ severity: 'MAJOR' })]);
    expect(oneMajor.theologicalScore).toBeLessThan(twoModerate.theologicalScore!);
  });

  it('is set by the worst concern, not by how many there are', () => {
    const one = scoreSong([concern({ severity: 'MODERATE' })]);
    const several = scoreSong([
      concern({ severity: 'MODERATE' }),
      concern({ severity: 'MINOR' }),
      concern({ severity: 'MINOR' }),
      concern({ severity: 'MINOR' }),
    ]);
    expect(several.theological.level).toBe(one.theological.level);
    expect(several.theological.ceilingSetBy?.severity).toBe('MODERATE');
  });

  it('takes the level as the lower of ceiling and merit', () => {
    const result = scoreSong([
      ...Array.from({ length: 5 }, () => strength({ severity: 'MAJOR' })),
      concern({ severity: 'MAJOR' }),
    ]);
    const t = result.theological;
    expect(t.level).toBe(Math.min(t.ceiling!, t.merit!));
    expect(t.ceilingBinds).toBe(true);
  });

  it('does not let merit buy off a fault', () => {
    const flawed = concern({ severity: 'MAJOR', centrality: 'CORE' });
    const few = scoreSong([flawed, strength({ severity: 'MODERATE' })]);
    const many = scoreSong([flawed, ...Array.from({ length: 9 }, () => strength({ severity: 'MAJOR' }))]);
    expect(many.theologicalScore).toBe(few.theologicalScore);
  });

  it('lowers the ceiling for a core error that recurs, and raises it for a peripheral one', () => {
    const plain = scoreSong([concern({ severity: 'MODERATE', centrality: 'IMPORTANT' })]);
    const coreRecurring = scoreSong([concern({ severity: 'MODERATE', centrality: 'CORE', recurring: true })]);
    const peripheral = scoreSong([concern({ severity: 'MODERATE', centrality: 'PERIPHERAL' })]);

    expect(coreRecurring.theological.ceiling).toBe(plain.theological.ceiling! - 1);
    expect(peripheral.theological.ceiling).toBe(plain.theological.ceiling! + 1);
  });

  it('lets biblical soundness cap the overall score', () => {
    const result = scoreSong([
      concern({ component: 'THEOLOGICAL', severity: 'MAJOR', centrality: 'CORE' }),
      ...Array.from({ length: 5 }, () => strength({ component: 'COMMUNAL', severity: 'MAJOR' })),
      ...Array.from({ length: 5 }, () => strength({ component: 'CLARITY', severity: 'MAJOR' })),
    ]);

    // A singable, clear song cannot average its way past what it teaches.
    expect(result.overallScore).toBe(result.theologicalScore);
    expect(result.overallCeiling).toBe(result.theologicalScore);
    expect(result.recommendation).toBe('NOT_RECOMMENDED');
  });

  it('keeps criteria independent', () => {
    const result = scoreSong([
      concern({ component: 'CLARITY', severity: 'MODERATE' }),
      strength({ component: 'CLARITY', severity: 'MINOR' }),
      strength({ component: 'THEOLOGICAL', severity: 'MAJOR' }),
    ]);
    expect(result.theological.level).toBe(8);
    expect(result.clarity.level).toBeLessThan(result.theological.level!);
  });

  it('never returns a level outside 0–10', () => {
    const catastrophic = Array.from({ length: 12 }, () =>
      concern({ severity: 'SEVERE', centrality: 'CORE', recurring: true }),
    );
    const result = scoreSong(catastrophic);
    expect(result.theological.level).toBeGreaterThanOrEqual(0);
    expect(result.theological.level).toBeLessThanOrEqual(RUBRIC_MAX_LEVEL);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
  });

  it('names the finding that set each half, so the level can be audited', () => {
    const result = scoreSong([
      strength({ severity: 'MINOR' }),
      strength({ severity: 'MAJOR' }),
      concern({ severity: 'MINOR' }),
      concern({ severity: 'MODERATE', centrality: 'CORE' }),
    ]);
    expect(result.theological.meritSetBy?.severity).toBe('MAJOR');
    expect(result.theological.ceilingSetBy?.severity).toBe('MODERATE');
    expect(result.theological.ceilingSetBy?.centrality).toBe('CORE');
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

describe('worstConcern and bestStrength', () => {
  it('pick the deciding findings the rubric actually used', () => {
    const mild = concern({ severity: 'MINOR' });
    const worst = concern({ severity: 'MAJOR' });
    const modest = strength({ severity: 'MINOR' });
    const best = strength({ severity: 'MAJOR' });

    expect(worstConcern([mild, worst, modest, best])).toBe(worst);
    expect(bestStrength([mild, worst, modest, best])).toBe(best);
  });

  it('return null when there is nothing of that kind', () => {
    expect(worstConcern([strength()])).toBeNull();
    expect(bestStrength([concern()])).toBeNull();
  });

  it('break ties towards the finding written first', () => {
    const first = concern({ severity: 'MODERATE', centrality: 'CORE' });
    const second = concern({ severity: 'MODERATE', centrality: 'PERIPHERAL' });
    expect(worstConcern([first, second])).toBe(first);
  });
});

describe('classifySongRecommendation', () => {
  it('recommends only above 80 with sound doctrine', () => {
    expect(classifySongRecommendation(88, 9)).toBe('RECOMMENDED');
  });

  it('downgrades to caution below 80', () => {
    expect(classifySongRecommendation(79, 9)).toBe('RECOMMENDED_WITH_CAUTION');
  });

  it('downgrades on a weak biblical level however high the average', () => {
    expect(classifySongRecommendation(95, 4)).toBe('RECOMMENDED_WITH_CAUTION');
  });

  it('refuses to recommend a significant error about something central', () => {
    expect(classifySongRecommendation(99, 2)).toBe('NOT_RECOMMENDED');
    expect(classifySongRecommendation(99, 0)).toBe('NOT_RECOMMENDED');
  });

  it('refuses to recommend below 60', () => {
    expect(classifySongRecommendation(59, 10)).toBe('NOT_RECOMMENDED');
  });

  it('refuses to recommend a song it could not score', () => {
    expect(classifySongRecommendation(null, null)).toBe('NOT_RECOMMENDED');
  });
});

describe('classifyRecommendation — still used for artist research', () => {
  it('recommends only when both overall and doctrine clear 80 with no major issue', () => {
    expect(classifyRecommendation({ overallScore: 88, theologicalScore: 90, hasSevere: false, hasMajor: false })).toBe(
      'RECOMMENDED',
    );
  });

  it('refuses to recommend on a severe concern at any score', () => {
    expect(classifyRecommendation({ overallScore: 99, theologicalScore: 99, hasSevere: true, hasMajor: false })).toBe(
      'NOT_RECOMMENDED',
    );
  });

  it('downgrades on a major concern even with high scores', () => {
    expect(classifyRecommendation({ overallScore: 95, theologicalScore: 95, hasSevere: false, hasMajor: true })).toBe(
      'RECOMMENDED_WITH_CAUTION',
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
