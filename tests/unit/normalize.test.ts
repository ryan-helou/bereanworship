import { describe, expect, it } from 'vitest';
import {
  canonicalize,
  clampExcerpt,
  normalizeArtist,
  normalizeTitle,
  parseImportLine,
  slugify,
  songSlug,
  stripVersionSuffix,
  wordCount,
} from '@/lib/normalize';

/**
 * Identity rules.
 *
 * Two failure modes matter and pull in opposite directions: collapsing two
 * genuinely different songs into one, and failing to recognise the same song
 * written differently. Both are tested here.
 */

describe('normalizeTitle', () => {
  it('collapses case and whitespace differences', () => {
    const forms = ['How Great Thou Art', 'HOW GREAT THOU ART', 'how great thou art', '  How   Great Thou Art  '];
    const normalized = forms.map(normalizeTitle);
    expect(new Set(normalized).size).toBe(1);
    expect(normalized[0]).toBe('how great thou art');
  });

  it('ignores punctuation and apostrophe style', () => {
    expect(normalizeTitle("O Come, O Come, Emmanuel!")).toBe('o come o come emmanuel');
    expect(normalizeTitle('It’s Your Breath')).toBe(normalizeTitle("It's Your Breath"));
    expect(normalizeTitle('Holy, Holy, Holy!')).toBe('holy holy holy');
  });

  it('folds ampersands to "and"', () => {
    expect(normalizeTitle('Faith & Hope')).toBe(normalizeTitle('Faith and Hope'));
  });

  it('strips diacritics', () => {
    expect(normalizeTitle('Behold Él')).toBe('behold el');
  });

  it('strips recording-variant suffixes', () => {
    const base = normalizeTitle('Great Are You Lord');
    expect(normalizeTitle('Great Are You Lord (Live)')).toBe(base);
    expect(normalizeTitle('Great Are You Lord - Acoustic')).toBe(base);
    expect(normalizeTitle('Great Are You Lord [Radio Edit]')).toBe(base);
    expect(normalizeTitle('Great Are You Lord (2011 Remaster)')).toBe(base);
  });

  // The important counter-case: a parenthetical is often part of the real title.
  it('keeps meaningful parentheticals that are part of the song', () => {
    expect(normalizeTitle('Amazing Grace (My Chains Are Gone)')).not.toBe(normalizeTitle('Amazing Grace'));
    expect(normalizeTitle('Amazing Grace (My Chains Are Gone)')).toBe('amazing grace my chains are gone');
  });

  it('does not strip leading articles', () => {
    expect(normalizeTitle('The Blessing')).not.toBe(normalizeTitle('Blessing'));
  });
});

describe('stripVersionSuffix', () => {
  it('removes only true version markers', () => {
    expect(stripVersionSuffix('Song Title (Live)')).toBe('Song Title');
    expect(stripVersionSuffix('Song Title (Live at Passion 2013)')).toBe('Song Title');
    expect(stripVersionSuffix('Song Title (My Chains Are Gone)')).toBe('Song Title (My Chains Are Gone)');
  });

  it('handles stacked suffixes', () => {
    expect(stripVersionSuffix('Song Title (Live) [Remastered]')).toBe('Song Title');
  });
});

describe('normalizeArtist', () => {
  it('collapses case, punctuation and ampersands', () => {
    expect(normalizeArtist('Keith & Kristyn Getty')).toBe(normalizeArtist('Keith and Kristyn Getty'));
    expect(normalizeArtist('CHRIS TOMLIN')).toBe('chris tomlin');
  });

  it('drops a leading "the"', () => {
    expect(normalizeArtist("The Porter's Gate")).toBe(normalizeArtist("Porter's Gate"));
  });

  it('drops featured-artist noise', () => {
    expect(normalizeArtist('Chris Tomlin feat. Someone Else')).toBe('chris tomlin');
    expect(normalizeArtist('Chris Tomlin ft. Someone')).toBe('chris tomlin');
    expect(normalizeArtist('Chris Tomlin featuring Someone')).toBe('chris tomlin');
  });

  it('keeps genuinely different artists distinct', () => {
    expect(normalizeArtist('Casting Crowns')).not.toBe(normalizeArtist('All Sons & Daughters'));
  });
});

describe('song identity', () => {
  it('keeps same-titled songs by different artists apart', () => {
    // Identity is (artist, normalized title) — the title alone is never enough.
    const titleA = normalizeTitle('Great Are You Lord');
    const titleB = normalizeTitle('Great Are You Lord');
    expect(titleA).toBe(titleB);

    const slugA = songSlug('Great Are You Lord', 'All Sons & Daughters');
    const slugB = songSlug('Great Are You Lord', 'Casting Crowns');
    expect(slugA).not.toBe(slugB);
  });
});

describe('slugify', () => {
  it('produces url-safe ascii', () => {
    expect(slugify('Holy, Holy, Holy! Lord God Almighty')).toBe('holy-holy-holy-lord-god-almighty');
    expect(slugify('Behold Él')).toBe('behold-el');
    expect(slugify("It's Well")).toBe('its-well');
  });

  it('never returns an empty slug', () => {
    expect(slugify('!!!')).toBe('untitled');
    expect(slugify('')).toBe('untitled');
  });

  it('never leaves a trailing hyphen', () => {
    expect(slugify('Song Title —')).not.toMatch(/-$/);
    expect(songSlug('A'.repeat(200), 'B'.repeat(200))).not.toMatch(/-$/);
  });
});

describe('parseImportLine', () => {
  it.each([
    ['Amazing Grace — John Newton', 'Amazing Grace', 'John Newton'],
    ['Amazing Grace – John Newton', 'Amazing Grace', 'John Newton'],
    ['Amazing Grace - John Newton', 'Amazing Grace', 'John Newton'],
    ['Amazing Grace | John Newton', 'Amazing Grace', 'John Newton'],
    ['Amazing Grace by John Newton', 'Amazing Grace', 'John Newton'],
    ['"Amazing Grace","John Newton"', 'Amazing Grace', 'John Newton'],
    ['Amazing Grace,John Newton', 'Amazing Grace', 'John Newton'],
  ])('parses %s', (line, title, artist) => {
    const result = parseImportLine(line, 1);
    expect(result?.title).toBe(title);
    expect(result?.artist).toBe(artist);
  });

  it('accepts a title with no artist, and flags it', () => {
    const result = parseImportLine('Amazing Grace', 1);
    expect(result?.title).toBe('Amazing Grace');
    expect(result?.artist).toBeNull();
    expect(result?.warning).toContain('No artist');
  });

  it('skips blanks, comments and a CSV header row', () => {
    expect(parseImportLine('', 1)).toBeNull();
    expect(parseImportLine('   ', 1)).toBeNull();
    expect(parseImportLine('# a comment', 1)).toBeNull();
    expect(parseImportLine('Title,Artist', 1)).toBeNull();
    expect(parseImportLine('"Song Title","Artist"', 1)).toBeNull();
  });

  it('preserves hyphens inside a title when splitting on a dash', () => {
    const result = parseImportLine('Well-Known Song — Some Artist', 1);
    expect(result?.title).toBe('Well-Known Song');
    expect(result?.artist).toBe('Some Artist');
  });
});

describe('copyright guard', () => {
  it('caps a lyric excerpt at ten words', () => {
    const long = 'one two three four five six seven eight nine ten eleven twelve thirteen';
    const clamped = clampExcerpt(long, 10);
    expect(wordCount(clamped.replace('…', ''))).toBeLessThanOrEqual(10);
    expect(clamped.endsWith('…')).toBe(true);
  });

  it('leaves a short excerpt untouched', () => {
    expect(clampExcerpt('grace that taught my heart to fear')).toBe('grace that taught my heart to fear');
  });

  it('collapses whitespace while clamping', () => {
    expect(clampExcerpt('  amazing    grace  ')).toBe('amazing grace');
  });
});

describe('canonicalize', () => {
  it('straightens smart punctuation without destroying meaning', () => {
    expect(canonicalize('“Amazing”  Grace’s')).toBe('"Amazing" Grace\'s');
  });
});
