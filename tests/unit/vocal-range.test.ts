import { describe, expect, it } from 'vitest';
import {
  CONGREGATIONAL_HIGH,
  CONGREGATIONAL_LOW,
  midiToNote,
  noteToMidi,
  rangeLabel,
  scoreVocalRange,
} from '@/lib/scoring';

/**
 * Range difficulty. The important properties are that it is measured rather
 * than guessed, that it never silently invents a number, and that it stays
 * out of song validity.
 */

describe('noteToMidi', () => {
  it.each([
    ['C4', 60],
    ['A3', 57],
    ['D5', 74],
    ['C-1', 0],
    ['Bb3', 58],
    ['A#3', 58],
    ['Eb5', 75],
    ['G3', 55],
  ])('parses %s', (note, midi) => {
    expect(noteToMidi(note)).toBe(midi);
  });

  it('accepts unicode accidentals and stray whitespace', () => {
    expect(noteToMidi(' B♭3 ')).toBe(58);
    expect(noteToMidi('F♯4')).toBe(66);
  });

  it('returns null rather than a wrong number for unparseable input', () => {
    for (const bad of ['', 'H4', 'C', '4C', 'nonsense', null, undefined, 'C99']) {
      expect(noteToMidi(bad as string)).toBeNull();
    }
  });

  it('round-trips through midiToNote', () => {
    for (const note of ['C4', 'A3', 'D5', 'G2']) {
      expect(midiToNote(noteToMidi(note)!)).toBe(note);
    }
  });
});

describe('scoreVocalRange', () => {
  it('gives a full score to a comfortable octave', () => {
    const result = scoreVocalRange({ lowest: 'C4', highest: 'C5' })!;
    expect(result.score).toBe(100);
    expect(result.label).toBe('Easy');
    expect(result.span).toBe(12);
    expect(result.deductions).toHaveLength(0);
  });

  it('accepts the full congregational range with a modest deduction', () => {
    // A3-D5 is the widest most congregations manage; usable, not free.
    const result = scoreVocalRange({ lowest: 'A3', highest: 'D5' })!;
    expect(result.score).toBeLessThan(100);
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it('penalises notes above the congregational ceiling hardest', () => {
    const high = scoreVocalRange({ lowest: 'C4', highest: 'F5' })!;
    const low = scoreVocalRange({ lowest: 'G3', highest: 'C5' })!;
    // Same span either way; reaching high costs more than dropping low,
    // because that is where a congregation actually stops singing.
    expect(high.span).toBe(low.span);
    expect(high.score).toBeLessThan(low.score);
  });

  it('treats a high tessitura as harder than a single high note', () => {
    const touchesHigh = scoreVocalRange({ lowest: 'C4', highest: 'E5' })!;
    const sitsHigh = scoreVocalRange({ lowest: 'C4', highest: 'E5', tessituraHigh: 'D5' })!;
    expect(sitsHigh.score).toBeLessThan(touchesHigh.score);
  });

  it('scores monotonically as the range widens', () => {
    const scores = ['C5', 'D5', 'E5', 'F5', 'G5'].map(
      (highest) => scoreVocalRange({ lowest: 'C4', highest })!.score,
    );
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
  });

  it('stays within 0-100 for an absurd range', () => {
    const result = scoreVocalRange({ lowest: 'C2', highest: 'C7' })!;
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('records an auditable deduction for every penalty', () => {
    const result = scoreVocalRange({ lowest: 'G3', highest: 'F5' })!;
    expect(result.deductions.length).toBeGreaterThan(0);
    const total = result.deductions.reduce((sum, d) => sum + d.points, 0);
    expect(result.score).toBe(100 - total);
  });

  /** The whole point: a guessed range is worse than none. */
  it('returns null rather than estimating when pitches are missing or bad', () => {
    expect(scoreVocalRange({ lowest: null, highest: 'D5' })).toBeNull();
    expect(scoreVocalRange({ lowest: 'A3', highest: null })).toBeNull();
    expect(scoreVocalRange({ lowest: 'nonsense', highest: 'D5' })).toBeNull();
    expect(scoreVocalRange({ lowest: undefined, highest: undefined })).toBeNull();
  });

  it('rejects an inverted range instead of scoring it', () => {
    expect(scoreVocalRange({ lowest: 'D5', highest: 'A3' })).toBeNull();
  });

  it('uses sensible congregational bounds', () => {
    expect(midiToNote(CONGREGATIONAL_LOW)).toBe('A3');
    expect(midiToNote(CONGREGATIONAL_HIGH)).toBe('D5');
  });
});

describe('rangeLabel', () => {
  it.each([
    [100, 'Easy'],
    [85, 'Easy'],
    [84, 'Comfortable'],
    [70, 'Comfortable'],
    [69, 'Demanding'],
    [55, 'Demanding'],
    [54, 'Difficult'],
    [40, 'Difficult'],
    [39, 'Very difficult'],
    [0, 'Very difficult'],
  ])('labels %i as %s', (score, label) => {
    expect(rangeLabel(score)).toBe(label);
  });

  it('has no label for an unmeasured range', () => {
    expect(rangeLabel(null)).toBeNull();
    expect(rangeLabel(undefined)).toBeNull();
  });
});

describe('note spelling', () => {
  /**
   * Bb and A# are the same pitch but not the same note. A song in Eb is
   * written with flats, and showing a musician "A#3–D#5" for it looks wrong
   * even though it sounds identical.
   */
  it('preserves flats rather than normalising to sharps', () => {
    const result = scoreVocalRange({ lowest: 'Bb3', highest: 'Eb5' })!;
    expect(result.lowest).toBe('Bb3');
    expect(result.highest).toBe('Eb5');
  });

  it('preserves sharps where they were given', () => {
    const result = scoreVocalRange({ lowest: 'A#3', highest: 'D#5' })!;
    expect(result.lowest).toBe('A#3');
    expect(result.highest).toBe('D#5');
  });

  it('scores enharmonic spellings identically', () => {
    const flat = scoreVocalRange({ lowest: 'Bb3', highest: 'Eb5' })!;
    const sharp = scoreVocalRange({ lowest: 'A#3', highest: 'D#5' })!;
    expect(flat.score).toBe(sharp.score);
    expect(flat.span).toBe(sharp.span);
  });

  it('tidies casing, whitespace and unicode accidentals for display', () => {
    const result = scoreVocalRange({ lowest: ' b♭3 ', highest: 'e♭5' })!;
    expect(result.lowest).toBe('Bb3');
    expect(result.highest).toBe('Eb5');
  });
});
