/**
 * Canonical identity for songs and artists.
 *
 * The problem this solves: the same song arrives as "How Great Thou Art",
 * "HOW GREAT THOU ART", "  how great thou art  " and "How Great Thou Art
 * (Live)". All four are one song. Meanwhile "Great Are You Lord — All Sons &
 * Daughters" and "Great Are You Lord — Casting Crowns" are two different
 * songs that must never collapse into one another.
 *
 * The rule: titles normalize aggressively, but identity is always
 * (normalized title + artist). Normalization never crosses the artist line.
 */

/** Parenthetical/bracketed suffixes that describe a *recording*, not a song. */
const VERSION_SUFFIXES = [
  'live',
  'acoustic',
  'radio edit',
  'radio version',
  'album version',
  'single version',
  'studio version',
  'studio',
  'remix',
  'reprise',
  'demo',
  'instrumental',
  'extended',
  'edit',
  'remastered',
  'remaster',
  'deluxe',
  'bonus track',
  'official',
  'official video',
  'official audio',
  'lyric video',
  'lyrics',
  'audio',
  'video',
  'cover',
  'karaoke',
  'feat',
  'featuring',
];

/** Leading articles are kept — "The Blessing" is not "Blessing". */
const SMART_QUOTES = /[‘’‚‛′‵]/g;
const SMART_DQUOTES = /[“”„‟″‶]/g;
const DASHES = /[‐‑‒–—―−]/g;

/**
 * Straighten typographic characters and collapse whitespace, without
 * destroying information. Safe to persist as the human-facing canonical form.
 */
export function canonicalize(input: string): string {
  return input
    .normalize('NFKC')
    .replace(SMART_QUOTES, "'")
    .replace(SMART_DQUOTES, '"')
    .replace(DASHES, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip diacritics: "Behold Él" → "Behold El". */
function stripDiacritics(input: string): string {
  return input.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Remove trailing "(Live)", "[Radio Edit]", "- Acoustic" style qualifiers.
 * Only strips when the parenthetical is *entirely* a version marker, so
 * "Amazing Grace (My Chains Are Gone)" survives intact — it is a real,
 * distinct song, not a recording variant.
 */
export function stripVersionSuffix(input: string): string {
  let out = input;
  let changed = true;

  while (changed) {
    changed = false;

    // Bracketed suffix at the end: "(Live)" / "[Acoustic Version]"
    out = out.replace(/\s*[([{]([^)\]}]*)[)\]}]\s*$/, (match, inner: string) => {
      if (isVersionMarker(inner)) {
        changed = true;
        return '';
      }
      return match;
    });

    // Dash suffix at the end: " - Live"
    out = out.replace(/\s+-\s+([^-]+)$/, (match, inner: string) => {
      if (isVersionMarker(inner)) {
        changed = true;
        return '';
      }
      return match;
    });
  }

  return out.trim();
}

function isVersionMarker(inner: string): boolean {
  const cleaned = inner
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return false;

  // "2011 remaster", "live at passion" etc. — drop years and filler words.
  const words = cleaned
    .split(' ')
    .filter((w) => w && !/^\d{4}$/.test(w) && !['at', 'from', 'the', 'a', 'in', 'version'].includes(w));
  if (words.length === 0) return true;

  const rejoined = words.join(' ');
  return VERSION_SUFFIXES.some(
    (suffix) => rejoined === suffix || rejoined.startsWith(`${suffix} `) || rejoined.endsWith(` ${suffix}`),
  );
}

/**
 * The aggressive matching key. Lowercase, no punctuation, no diacritics,
 * no recording-variant suffixes, "&" folded to "and", collapsed whitespace.
 *
 *   "How Great Thou Art"   → "how great thou art"
 *   "HOW GREAT THOU ART!"  → "how great thou art"
 *   "O Come, O Come"       → "o come o come"
 */
export function normalizeTitle(input: string): string {
  const base = stripVersionSuffix(canonicalize(input));
  return stripDiacritics(base)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\+/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Artist normalization. Same aggression as titles, plus dropping the leading
 * "the" ("The Porter's Gate" ≡ "Porter's Gate") and trailing collaboration
 * noise, which import lists are full of.
 */
export function normalizeArtist(input: string): string {
  const base = canonicalize(input)
    .replace(/\s*\b(feat\.?|featuring|ft\.?|with|w\/)\b.*$/i, '')
    .trim();

  return stripDiacritics(base)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^the /, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** URL slug. Deterministic, ASCII-only, never empty. */
export function slugify(input: string): string {
  const slug = stripDiacritics(canonicalize(input))
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');

  return slug || 'untitled';
}

/** Slug for a song, disambiguated by artist so titles may safely collide. */
export function songSlug(title: string, artistName: string): string {
  return `${slugify(title)}-${slugify(artistName)}`.slice(0, 160).replace(/-+$/g, '');
}

/** Appends -2, -3 … until the candidate is not in `taken`. */
export function uniqueSlug(base: string, taken: (candidate: string) => Promise<boolean> | boolean) {
  return (async () => {
    let candidate = base;
    let n = 1;
    while (await taken(candidate)) {
      n += 1;
      candidate = `${base}-${n}`;
    }
    return candidate;
  })();
}

export interface ParsedEntry {
  title: string;
  artist: string | null;
  raw: string;
  lineNumber: number;
  warning?: string;
}

/**
 * Parses one line of a bulk import. Accepts, in order of preference:
 *
 *   Title — Artist        (em dash, en dash or hyphen)
 *   Title | Artist
 *   "Title","Artist"      (CSV, with or without quotes)
 *   Title by Artist
 *   Title                 (artist unknown → flagged for the admin)
 */
export function parseImportLine(line: string, lineNumber: number): ParsedEntry | null {
  const raw = line.trim();
  if (!raw || raw.startsWith('#')) return null;

  // Skip an obvious CSV header row.
  if (/^\s*"?(song\s*)?title"?\s*[,|]\s*"?artist"?/i.test(raw)) return null;

  const csv = splitCsvLine(raw);
  if (csv && csv.length >= 2 && csv[0] && csv[1]) {
    return { title: canonicalize(csv[0]), artist: canonicalize(csv[1]) || null, raw, lineNumber };
  }

  const separators = [
    /\s+[—–]\s+/, // em/en dash with spaces
    /\s+-\s+/, // hyphen with spaces
    /\s*\|\s*/, // pipe
    /\s+\bby\b\s+/i, // "Title by Artist"
    /\s*\t+\s*/, // tab
  ];

  for (const sep of separators) {
    const parts = raw.split(sep);
    if (parts.length >= 2) {
      const title = canonicalize(parts[0]);
      const artist = canonicalize(parts.slice(1).join(' - '));
      if (title && artist) return { title, artist, raw, lineNumber };
    }
  }

  if (csv && csv.length === 1 && csv[0]) {
    return {
      title: canonicalize(csv[0]),
      artist: null,
      raw,
      lineNumber,
      warning: 'No artist supplied — artist must be identified before review.',
    };
  }

  return {
    title: canonicalize(raw),
    artist: null,
    raw,
    lineNumber,
    warning: 'No artist supplied — artist must be identified before review.',
  };
}

/** Minimal RFC-4180-ish splitter; returns null when the line is not CSV-shaped. */
function splitCsvLine(line: string): string[] | null {
  if (!line.includes(',') && !line.includes('"')) return null;

  const out: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current.trim());

  return out.map((v) => v.replace(/^"|"$/g, '').trim());
}

/** Word count used to enforce the 10-word copyright ceiling on lyric excerpts. */
export function wordCount(input: string): number {
  return input.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Hard-enforces the copyright rule: no more than `max` words are ever
 * persisted or rendered from a copyrighted lyric.
 */
export function clampExcerpt(input: string, max = 10): string {
  const words = canonicalize(input).split(/\s+/).filter(Boolean);
  if (words.length <= max) return words.join(' ');
  return `${words.slice(0, max).join(' ')}…`;
}
