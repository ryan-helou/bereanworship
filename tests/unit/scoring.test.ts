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
  combineAxes,
  classifySongRecommendation,
  effectiveArtistSeverity,
  scoreArtist,
  scoreBand,
  scoreLabel,
  scoreSong,
  scoreSoundness,
  UNVERIFIED_CLEAN_LEVEL,
  scoreSubstance,
  severityLabel,
  songFindingImpact,
  worstConcern,
  type ScorableSongFinding,
} from '@/lib/scoring';
import { independentSourceCount } from '@/lib/ai/schemas';

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
  likelihood: 'POSSIBLE',
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

describe('the two doctrinal axes', () => {
  const FULL = {
    namesGod: true,
    statesAnAct: true,
    teachesDoctrine: true,
    godDirected: true,
    groundsClaims: true,
    corporateVoice: true,
    engagesScripture: true,
  };
  const EMPTY = Object.fromEntries(Object.keys(FULL).map((k) => [k, false]));

  it('sets soundness by the worst thing wrong, not by how many things there are', () => {
    const one = scoreSoundness([concern({ severity: 'MODERATE' })]);
    const several = scoreSoundness([
      concern({ severity: 'MODERATE' }),
      concern({ severity: 'MINOR' }),
      concern({ severity: 'MINOR' }),
    ]);
    expect(several.level).toBe(one.level);
  });

  it('costs a song more when an ordinary singer would take the wrong meaning', () => {
    const possible = scoreSoundness([concern({ severity: 'MODERATE', likelihood: 'POSSIBLE' })]);
    const likely = scoreSoundness([concern({ severity: 'MODERATE', likelihood: 'LIKELY' })]);
    expect(likely.level).toBe(possible.level - 1);
  });

  it('stacks centrality, likelihood and recurrence so one bad line lands hard', () => {
    const bad = scoreSoundness([
      concern({ severity: 'MODERATE', centrality: 'CORE', likelihood: 'LIKELY', recurring: true }),
    ]);
    expect(bad.level).toBe(2);
  });

  it('flags a major error as settling the verdict by itself', () => {
    expect(scoreSoundness([concern({ severity: 'MAJOR' })]).disqualifying).toBe(true);
    expect(scoreSoundness([concern({ severity: 'MODERATE' })]).disqualifying).toBe(false);
  });

  it('gives a song with nothing wrong full soundness', () => {
    expect(scoreSoundness([strength()]).level).toBe(RUBRIC_MAX_LEVEL);
  });

  it('scores substance from the checklist, not from how many strengths were written', () => {
    const many = scoreSong(Array.from({ length: 9 }, () => strength({ severity: 'MAJOR' })), EMPTY);
    const few = scoreSong([strength({ severity: 'MINOR' })], EMPTY);
    // Nine strengths and one produce the same substance, because substance is
    // a fact about the song's content rather than about the reviewer's output.
    expect(many.substance.level).toBe(few.substance.level);
  });

  it('reports which checklist tests a song failed', () => {
    const result = scoreSubstance({ ...EMPTY, namesGod: true, teachesDoctrine: true });
    expect(result.level).toBe(3);
    expect(result.passed).toEqual(['namesGod', 'teachesDoctrine']);
    expect(result.failed).toContain('statesAnAct');
  });

  it('leaves a song that says nothing in the middle, however clean', () => {
    const clean = scoreSong([strength({ severity: 'MAJOR' })], EMPTY);
    expect(clean.soundness.level).toBe(RUBRIC_MAX_LEVEL);
    expect(clean.theologicalScore).toBeLessThan(50);
  });

  it('does not let a rich song buy off a bad line', () => {
    const rich = scoreSong(
      [concern({ severity: 'MODERATE', centrality: 'CORE', likelihood: 'LIKELY', recurring: true })],
      FULL,
    );
    // Full marks on every content test, and it still lands where the bad line
    // put it: content never lifts an error.
    expect(rich.substance.level).toBe(10);
    expect(rich.theologicalScore).toBe(rich.soundness.level * 10);
    expect(rich.theologicalScore).toBeLessThanOrEqual(20);
  });

  it('treats an unfilled checklist as a pre-3.0.0 review and falls back to the rubric', () => {
    const result = scoreSong([strength({ severity: 'MAJOR' })], null);
    expect(result.substance.unassessed).toBe(true);
    expect(result.theologicalScore).not.toBeNull();
  });

  it('never lets content lift a song above its soundness', () => {
    expect(combineAxes(3, 10)).toBe(3);
    expect(combineAxes(5, 10)).toBe(5);
    expect(combineAxes(10, 10)).toBe(10);
  });

  it('lets a clean record lift a thin song a little, and no more', () => {
    expect(combineAxes(10, 3)).toBeGreaterThan(3);
    expect(combineAxes(10, 3)).toBeLessThan(6);
  });

  it('puts a moderate core error on the level that names it', () => {
    // Level 4: "misleading wording, or a real error about an important doctrine".
    expect(scoreSoundness([concern({ severity: 'MODERATE', centrality: 'CORE' })]).level).toBe(4);
    // Level 2: "a significant error about something central".
    expect(scoreSoundness([concern({ severity: 'MAJOR', centrality: 'IMPORTANT' })]).level).toBe(2);
  });
});

describe('worship direction and delivery', () => {
  const EMPTY = Object.fromEntries(
    ['namesGod', 'statesAnAct', 'teachesDoctrine', 'godDirected', 'groundsClaims', 'corporateVoice', 'engagesScripture'].map(
      (k) => [k, false],
    ),
  );

  it('weighs being directed to God more than any other single test', () => {
    const directed = scoreSubstance({ ...EMPTY, godDirected: true });
    const named = scoreSubstance({ ...EMPTY, namesGod: true });
    const scripture = scoreSubstance({ ...EMPTY, engagesScripture: true });
    expect(directed.level).toBeGreaterThan(named.level);
    expect(directed.level).toBeGreaterThan(scripture.level);
  });

  it('scores a song about the singer below the same song directed to God', () => {
    const aboutGod = scoreSong([strength()], { ...EMPTY, godDirected: true, corporateVoice: true });
    const aboutSelf = scoreSong([strength()], EMPTY);
    expect(aboutGod.theologicalScore!).toBeGreaterThan(aboutSelf.theologicalScore!);
  });

  it('deducts for a performance piece, and off the overall rather than off communal', () => {
    const findings = [strength(), strength({ component: 'COMMUNAL' }), strength({ component: 'CLARITY' })];
    const room = scoreSong(findings, EMPTY, { performanceOrientation: 'CONGREGATIONAL', repetition: 'PURPOSEFUL' });
    const show = scoreSong(findings, EMPTY, { performanceOrientation: 'PERFORMANCE', repetition: 'PURPOSEFUL' });

    expect(show.overallScore!).toBeLessThan(room.overallScore!);
    // Communal itself is untouched: the penalty would be invisible there,
    // because the overall is capped at the biblical score.
    expect(show.communalScore).toBe(room.communalScore);
    expect(show.deliveryDeduction).toBeLessThan(0);
  });

  it('deducts for repetition that has outrun its content', () => {
    const findings = [strength(), strength({ component: 'COMMUNAL' })];
    const purposeful = scoreSong(findings, EMPTY, { repetition: 'PURPOSEFUL' });
    const heavy = scoreSong(findings, EMPTY, { repetition: 'HEAVY' });
    const excessive = scoreSong(findings, EMPTY, { repetition: 'EXCESSIVE' });

    expect(heavy.overallScore!).toBeLessThan(purposeful.overallScore!);
    expect(excessive.overallScore!).toBeLessThan(heavy.overallScore!);
  });

  it('does not penalise a refrain that carries its confession', () => {
    const findings = [strength()];
    expect(scoreSong(findings, EMPTY, { repetition: 'PURPOSEFUL' }).deliveryDeduction).toBe(0);
    expect(scoreSong(findings, EMPTY, { repetition: 'NONE' }).deliveryDeduction).toBe(0);
  });

  it('charges the worse of hype and repetition, not their sum', () => {
    const findings = [strength(), strength({ component: 'COMMUNAL' })];
    const both = scoreSong(findings, EMPTY, { performanceOrientation: 'PERFORMANCE_LEANING', repetition: 'EXCESSIVE' });
    const hypeOnly = scoreSong(findings, EMPTY, { performanceOrientation: 'PERFORMANCE_LEANING', repetition: 'PURPOSEFUL' });
    const worse = scoreSong(findings, EMPTY, { performanceOrientation: 'PERFORMANCE', repetition: 'HEAVY' });
    // Two equal faults cost what one does; the worse fault sets the charge.
    expect(both.deliveryDeduction).toBe(hypeOnly.deliveryDeduction);
    expect(worse.deliveryDeduction).toBeLessThan(both.deliveryDeduction);
  });
});

describe('which sources can vouch for a song', () => {
  const src = (over: Record<string, unknown>) =>
    ({ sourceType: 'PUBLICATION', credibilityTier: 'TIER_2', assessesContent: true, ...over }) as Parameters<
      typeof independentSourceCount
    >[0][number];

  it('counts independent scholarship that assessed the song', () => {
    expect(independentSourceCount([src({})])).toBe(1);
  });

  it('does not count an author biography, however authoritative', () => {
    expect(independentSourceCount([src({ sourceType: 'ACADEMIC', credibilityTier: 'TIER_1', assessesContent: false })])).toBe(0);
  });

  it('does not count the publisher, an encyclopedia or a blog', () => {
    expect(
      independentSourceCount([
        src({ sourceType: 'OFFICIAL_WEBSITE', credibilityTier: 'TIER_1' }),
        src({ credibilityTier: 'TIER_3' }),
        src({ sourceType: 'BLOG', credibilityTier: 'TIER_4' }),
      ]),
    ).toBe(0);
  });
});

describe('a clean record must be checked', () => {
  const FULL = Object.fromEntries(
    ['namesGod', 'statesAnAct', 'teachesDoctrine', 'godDirected', 'groundsClaims', 'corporateVoice', 'engagesScripture'].map(
      (k) => [k, true],
    ),
  );

  it('holds a clean record below full soundness when nothing independent was consulted', () => {
    const unchecked = scoreSong([strength({ severity: 'MAJOR' })], FULL, null, { independentSources: 0 });
    expect(unchecked.soundness.level).toBe(UNVERIFIED_CLEAN_LEVEL);
    expect(unchecked.soundness.unverified).toBe(true);
  });

  it('gives a clean record full soundness once an independent source stands behind it', () => {
    const checked = scoreSong([strength({ severity: 'MAJOR' })], FULL, null, { independentSources: 1 });
    expect(checked.soundness.level).toBe(RUBRIC_MAX_LEVEL);
    expect(checked.soundness.unverified).toBeFalsy();
  });

  it('leaves a song with a real concern exactly where the concern put it', () => {
    const flawed = [concern({ severity: 'MODERATE', centrality: 'CORE' })];
    const thin = scoreSong(flawed, FULL, null, { independentSources: 0 });
    const sourced = scoreSong(flawed, FULL, null, { independentSources: 3 });
    expect(thin.soundness.level).toBe(sourced.soundness.level);
  });

  it('does not let a concern that costs nothing exempt a song from the check', () => {
    const trivial = [concern({ severity: 'MINOR', centrality: 'PERIPHERAL' })];
    expect(scoreSoundness(trivial).level).toBe(RUBRIC_MAX_LEVEL);
    expect(scoreSong(trivial, FULL, null, { independentSources: 0 }).soundness.level).toBe(UNVERIFIED_CLEAN_LEVEL);
  });

  it('applies no evidence rule when evidence is not supplied', () => {
    expect(scoreSong([strength()], FULL).soundness.level).toBe(RUBRIC_MAX_LEVEL);
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
    expect(classifySongRecommendation(99, 3)).toBe('NOT_RECOMMENDED');
    expect(classifySongRecommendation(99, 2)).toBe('NOT_RECOMMENDED');
    expect(classifySongRecommendation(99, 0)).toBe('NOT_RECOMMENDED');
  });

  it('refuses to recommend below 40', () => {
    expect(classifySongRecommendation(39, 10)).toBe('NOT_RECOMMENDED');
    // 40-79 is caution, not refusal: 40 is where a level-4 song lands, and
    // level 4 is "singable only with teaching", not "do not sing".
    expect(classifySongRecommendation(40, 4)).toBe('RECOMMENDED_WITH_CAUTION');
  });

  it('refuses to recommend a major error whatever the total', () => {
    expect(classifySongRecommendation(95, 9, true)).toBe('NOT_RECOMMENDED');
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
