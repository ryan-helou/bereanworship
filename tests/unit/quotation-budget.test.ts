import { describe, expect, it } from 'vitest';
import {
  CLAIM_BUDGET,
  ClaimExtractionSchema,
  MAX_FINDING_LYRIC_WORDS,
  MAX_QUOTED_FINDINGS,
  applyQuotationBudget,
  evidenceCoverage,
} from '@/lib/ai/schemas';
import { excerptsOverlap, wordCount } from '@/lib/normalize';

/**
 * The copyright rule that a per-excerpt cap cannot enforce.
 *
 * The first published review obeyed the ten-word limit on every one of its
 * thirty-nine excerpts and still reproduced 198 words of the hymn. No single
 * field could detect that, because no field can see its siblings — so the
 * limit that matters is spent across the whole review, and these tests are
 * about the aggregate rather than the individual quote.
 */

const quoted = <T extends { lyricExcerpt?: string | null }>(findings: T[]) =>
  findings.filter((f) => Boolean(f.lyricExcerpt?.trim()));

const totalWords = (findings: Array<{ lyricExcerpt?: string | null }>) =>
  quoted(findings).reduce((sum, f) => sum + wordCount(f.lyricExcerpt!), 0);

/** Ten distinct words, so each finding costs the maximum a single quote may. */
const tenWords = (seed: string) =>
  Array.from({ length: 10 }, (_, i) => `${seed}${i}`).join(' ');

describe('excerpt overlap', () => {
  it('treats the same line quoted twice as one quotation', () => {
    expect(excerptsOverlap('God the uncreated One', 'god the uncreated one')).toBe(true);
    expect(excerptsOverlap('God the uncreated One', 'God the uncreated One,')).toBe(true);
  });

  it('catches a quote wholly inside another', () => {
    expect(excerptsOverlap('the Author of salvation', 'Author of salvation')).toBe(true);
  });

  it('sees through the clamp ellipsis', () => {
    expect(excerptsOverlap('kingdoms rise and kingdoms fall…', 'kingdoms rise and kingdoms fall')).toBe(true);
  });

  it('does not collapse genuinely different lines', () => {
    expect(excerptsOverlap('God the uncreated One', 'Mighty God in mortal flesh')).toBe(false);
  });

  it('compares whole words, so a shared stem is not a duplicate', () => {
    expect(excerptsOverlap('praise the Lord', 'praise the Lords of old')).toBe(false);
  });
});

describe('quotation budget', () => {
  it('caps how many findings may quote, however many ask to', () => {
    const findings = Array.from({ length: 20 }, (_, i) => ({
      severity: 'MINOR',
      lyricExcerpt: `line ${i}`,
    }));

    const { findings: out, report } = applyQuotationBudget(findings);

    expect(quoted(out)).toHaveLength(MAX_QUOTED_FINDINGS);
    expect(report.kept).toBe(MAX_QUOTED_FINDINGS);
    expect(report.droppedForBudget).toBe(20 - MAX_QUOTED_FINDINGS);
  });

  it('caps total lyric words even when the quote count is legal', () => {
    // Eight quotes is within the count limit; eighty words is not within the
    // word limit. This is the case a per-excerpt cap cannot see.
    const findings = Array.from({ length: MAX_QUOTED_FINDINGS }, (_, i) => ({
      severity: 'MINOR',
      lyricExcerpt: tenWords(`w${i}_`),
    }));

    const { findings: out } = applyQuotationBudget(findings);

    expect(totalWords(out)).toBeLessThanOrEqual(MAX_FINDING_LYRIC_WORDS);
    expect(quoted(out).length).toBeLessThan(MAX_QUOTED_FINDINGS);
  });

  it('never lets a review reassemble the song from compliant fragments', () => {
    // The shape of the review that prompted this: forty short, individually
    // legal excerpts.
    const findings = Array.from({ length: 40 }, (_, i) => ({
      severity: 'MODERATE',
      lyricExcerpt: `fragment number ${i} of the song`,
    }));

    const { findings: out } = applyQuotationBudget(findings);

    expect(totalWords(out)).toBeLessThanOrEqual(MAX_FINDING_LYRIC_WORDS);
    expect(out).toHaveLength(40);
  });

  it('spends the budget on the most serious findings first', () => {
    const findings = [
      { severity: 'MINOR', centrality: 'PERIPHERAL', lyricExcerpt: 'minor peripheral line' },
      { severity: 'SEVERE', centrality: 'CORE', lyricExcerpt: 'severe core line' },
      { severity: 'MODERATE', centrality: 'IMPORTANT', lyricExcerpt: 'moderate important line' },
    ];

    // Only one quote fits.
    const { findings: out } = applyQuotationBudget(findings, { maxQuotes: 1, maxWords: 100 });

    expect(out[1].lyricExcerpt).toBe('severe core line');
    expect(out[0].lyricExcerpt).toBeNull();
    expect(out[2].lyricExcerpt).toBeNull();
  });

  it('ranks strengths by magnitude, which is their severity field by another name', () => {
    const findings = [
      { magnitude: 'MINOR', lyricExcerpt: 'a modest positive' },
      { magnitude: 'MAJOR', lyricExcerpt: 'an outstanding statement' },
    ];

    const { findings: out } = applyQuotationBudget(findings, { maxQuotes: 1, maxWords: 100 });

    expect(out[1].lyricExcerpt).toBe('an outstanding statement');
    expect(out[0].lyricExcerpt).toBeNull();
  });

  it('charges a repeated line once and prints it once', () => {
    const findings = [
      { severity: 'MAJOR', lyricExcerpt: 'kingdoms rise and kingdoms fall' },
      { severity: 'MINOR', lyricExcerpt: 'Kingdoms rise and kingdoms fall!' },
      { severity: 'MINOR', lyricExcerpt: 'a different line entirely' },
    ];

    const { findings: out, report } = applyQuotationBudget(findings);

    expect(report.droppedAsDuplicate).toBe(1);
    expect(quoted(out)).toHaveLength(2);
    expect(out[1].lyricExcerpt).toBeNull();
  });

  it('strips the quote but keeps the finding, which still says where it came from', () => {
    const findings = Array.from({ length: 12 }, (_, i) => ({
      severity: 'MINOR',
      title: `finding ${i}`,
      songLocation: 'CHORUS',
      lyricExcerpt: `line ${i}`,
    }));

    const { findings: out } = applyQuotationBudget(findings);

    expect(out).toHaveLength(12);
    expect(out.every((f) => f.title && f.songLocation === 'CHORUS')).toBe(true);
  });

  it('leaves an already-frugal review untouched', () => {
    const findings = [
      { severity: 'MAJOR', lyricExcerpt: 'one short line' },
      { severity: 'MINOR', lyricExcerpt: null },
      { severity: 'MINOR', lyricExcerpt: 'another short line' },
    ];

    const { findings: out, report } = applyQuotationBudget(findings);

    expect(out).toEqual(findings);
    expect(report).toMatchObject({ kept: 2, droppedForBudget: 0, droppedAsDuplicate: 0 });
  });
});

describe('evidence coverage', () => {
  it('counts a located finding as checkable, not just a quoting one', () => {
    const coverage = evidenceCoverage([
      { lyricExcerpt: 'a quoted phrase', songLocation: 'CHORUS' },
      { lyricExcerpt: null, songLocation: 'VERSE_2' },
      { lyricExcerpt: null, songLocation: 'NOT_LYRICAL' },
    ]);

    expect(coverage.grounded).toBe(3);
    expect(coverage.quoted).toBe(1);
    expect(coverage.ratio).toBe(1);
  });

  it('reports a finding that neither quotes nor locates as ungrounded', () => {
    const coverage = evidenceCoverage([
      { lyricExcerpt: null, songLocation: 'CHORUS' },
      { lyricExcerpt: null, songLocation: 'UNKNOWN' },
    ]);

    expect(coverage.grounded).toBe(1);
    expect(coverage.ratio).toBe(0.5);
  });

  it('reports lyric words spent, which is the number the budget is about', () => {
    const coverage = evidenceCoverage([
      { lyricExcerpt: 'three words here', songLocation: 'CHORUS' },
      { lyricExcerpt: 'two words', songLocation: 'BRIDGE' },
    ]);

    expect(coverage.quotedWords).toBe(5);
  });
});

describe('claim extraction boundary', () => {
  it('budgets the claim pool as it is parsed, so an over-quoting extraction cannot pass one downstream', () => {
    const parsed = ClaimExtractionSchema.parse({
      lyricsAvailable: true,
      perspective: 'CORPORATE_WE',
      claims: Array.from({ length: 25 }, (_, i) => ({
        claim: `The song asserts something number ${i}.`,
        subject: 'God',
        location: 'VERSE_1',
        lyricExcerpt: tenWords(`c${i}_`),
      })),
      gospelClarity: 'IMPLICIT',
    });

    expect(parsed.claims).toHaveLength(25);
    expect(quoted(parsed.claims).length).toBeLessThanOrEqual(CLAIM_BUDGET.maxQuotes);
    expect(totalWords(parsed.claims)).toBeLessThanOrEqual(CLAIM_BUDGET.maxWords);
  });

  it('still accepts the unnumbered VERSE location earlier reviews were written with', () => {
    const parsed = ClaimExtractionSchema.parse({
      lyricsAvailable: true,
      perspective: 'CORPORATE_WE',
      claims: [{ claim: 'God is the creator of all.', subject: 'God', location: 'VERSE' }],
      gospelClarity: 'IMPLICIT',
    });

    expect(parsed.claims[0].location).toBe('VERSE');
  });
});
