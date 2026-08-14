import { z } from 'zod';
import { clampExcerpt, excerptsOverlap, wordCount } from '../normalize';

/**
 * Structured contracts for every pipeline stage.
 *
 * The model never returns prose we parse by hand and never returns a score.
 * It returns validated findings; `src/lib/scoring.ts` turns those into
 * numbers. Anything that fails validation fails the job loudly rather than
 * being half-saved.
 */

/**
 * Quotation limits.
 *
 * A per-excerpt cap is necessary and not sufficient. The first published
 * review obeyed the ten-word rule perfectly and still reproduced most of the
 * hymn: thirty-nine individually-legal excerpts, 198 words, assembled into the
 * song. Reconstruction from compliant fragments is the failure mode a
 * per-field limit cannot see, because no field ever sees its siblings.
 *
 * So quotation is budgeted at the level of the whole review, not the finding.
 * Claims are the working pool the later stages draw from; findings are what
 * actually reaches the page, and carry the tighter budget.
 */
export const MAX_LYRIC_WORDS = 10;
export const MAX_QUOTED_FINDINGS = 8;
export const MAX_FINDING_LYRIC_WORDS = 60;
export const MAX_QUOTED_CLAIMS = 10;
export const MAX_CLAIM_LYRIC_WORDS = 70;
export const MAX_SCRIPTURE_WORDS = 45;

/**
 * Length ceilings.
 *
 * Reviews are read, not studied. An earlier version allowed 2500-character
 * explanations and got them — findings that were paragraphs of argument, which
 * nobody scans and which bury the actual claim. These caps force one or two
 * sentences per finding and a summary you can read in a breath. A finding that
 * genuinely will not fit is nearly always two findings.
 */
export const MAX_EXPLANATION_CHARS = 320;
export const MAX_ASSESSMENT_CHARS = 520;
export const MAX_SUMMARY_CHARS = 420;
export const MAX_RATIONALE_CHARS = 200;
export const MAX_RELEVANCE_CHARS = 170;
export const MAX_EVIDENCE_CHARS = 300;

const severity = z.enum(['MINOR', 'MODERATE', 'MAJOR', 'SEVERE']);
const strengthMagnitude = z.enum(['MINOR', 'MODERATE', 'MAJOR']);
const centrality = z.enum(['CORE', 'IMPORTANT', 'PERIPHERAL']);
const evidenceGrade = z.enum([
  'DIRECT_STATEMENT',
  'DOCUMENTED_FACT',
  'CREDIBLE_REPORTING',
  'ALLEGATION',
  'INTERPRETATION',
  'THEOLOGICAL_INFERENCE',
]);
const sourceType = z.enum([
  'OFFICIAL_WEBSITE',
  'STATEMENT_OF_FAITH',
  'INTERVIEW',
  'SERMON',
  'BOOK',
  'PUBLICATION',
  'ACADEMIC',
  'THEOLOGICAL_ORGANIZATION',
  'JOURNALISM',
  'BLOG',
  'SOCIAL_MEDIA',
  'LYRICS_DATABASE',
  'OTHER',
]);
const credibilityTier = z.enum(['TIER_1', 'TIER_2', 'TIER_3', 'TIER_4']);

/**
 * Copyright guard, applied at the schema boundary so an over-eager excerpt can
 * never reach the database. Truncates rather than rejecting: the analysis is
 * still valid, only the quotation is trimmed.
 */
const lyricExcerpt = z
  .string()
  .trim()
  .max(300)
  .transform((value) => (value ? clampExcerpt(value, MAX_LYRIC_WORDS) : value))
  .optional()
  .nullable();

const scriptureExcerpt = z
  .string()
  .trim()
  .max(600)
  .transform((value) => (value && wordCount(value) > MAX_SCRIPTURE_WORDS ? clampExcerpt(value, MAX_SCRIPTURE_WORDS) : value))
  .optional()
  .nullable();

/**
 * Where in the song a finding comes from.
 *
 * This is what makes a finding checkable when it is not quoting. A reader with
 * the lyrics in front of them can go to the named spot and judge the reviewer
 * for themselves — which is the whole purpose a quote was serving, achieved
 * without reprinting the song.
 *
 * `VERSE` (unnumbered) is retained so earlier payloads still validate.
 */
export const SONG_LOCATIONS = [
  'VERSE',
  'VERSE_1',
  'VERSE_2',
  'VERSE_3',
  'VERSE_4',
  'PRE_CHORUS',
  'CHORUS',
  'REFRAIN',
  'BRIDGE',
  'TAG',
  'INTRO',
  'OUTRO',
  'THROUGHOUT',
  /** The finding is about the song as a whole — including a doctrine it never addresses. */
  'WHOLE_SONG',
  /** Melody, range, structure or arrangement: there is nothing in the words to point at. */
  'NOT_LYRICAL',
  'UNKNOWN',
] as const;

export type SongLocation = (typeof SONG_LOCATIONS)[number];

const songLocation = z
  .enum(SONG_LOCATIONS)
  .default('UNKNOWN')
  .describe(
    'Where in the song this comes from. CHORUS/REFRAIN/THROUGHOUT means the congregation repeats it. WHOLE_SONG for findings about the song entire, including absences. NOT_LYRICAL for melody, range or structure.',
  );

const locationDetail = z
  .string()
  .trim()
  .max(80)
  .nullable()
  .optional()
  .describe('Optional pointer within that section — "the second line", "the closing couplet". Never lyric text.');

// ---------------------------------------------------------------------------
// Stage 1 — identification
// ---------------------------------------------------------------------------

export const IdentificationSchema = z.object({
  resolved: z
    .boolean()
    .describe('True only if you are confident this is a real, identifiable worship song.'),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  title: z.string().min(1).describe('The correct, properly capitalised song title.'),
  artist: z
    .string()
    .min(1)
    .describe('The artist, group or ministry primarily credited with the recording most churches know.'),
  artistType: z.enum(['INDIVIDUAL', 'GROUP', 'MINISTRY', 'CHURCH', 'COLLECTIVE', 'UNKNOWN']),
  album: z.string().nullable().optional(),
  releaseYear: z.number().int().min(1000).max(2200).nullable().optional(),
  genre: z
    .string()
    .nullable()
    .optional()
    .describe('Broad category only: Modern Worship, Traditional Hymn, Gospel, Contemporary Christian, Country Gospel, Hip-Hop, Choral, Other.'),
  isPublicDomain: z.boolean().default(false),
  notes: z.string().max(2000).nullable().optional(),
});
export type Identification = z.infer<typeof IdentificationSchema>;

// ---------------------------------------------------------------------------
// Stage 2 — theological claim extraction
// ---------------------------------------------------------------------------

export const ClaimSchema = z.object({
  claim: z.string().min(3).max(600).describe('A paraphrase, in your own words, of what the song asserts.'),
  subject: z
    .string()
    .max(120)
    .describe('The doctrine in view: God, Christ, salvation, grace, sin, sanctification, worship, etc.'),
  location: songLocation,
  locationDetail,
  lyricExcerpt,
});

export const ClaimExtractionSchema = z.object({
  lyricsAvailable: z
    .boolean()
    .describe('False if you do not reliably know this song\'s lyrics. Do not invent lyrics.'),
  perspective: z
    .enum(['CORPORATE_WE', 'INDIVIDUAL_I', 'ADDRESSED_TO_GOD', 'ABOUT_GOD', 'MIXED', 'UNKNOWN'])
    .default('UNKNOWN'),
  structuralNotes: z.string().max(2000).nullable().optional(),
  claims: z.array(ClaimSchema).max(30),
  gospelClarity: z
    .enum(['EXPLICIT', 'IMPLICIT', 'ABSENT', 'DISTORTED'])
    .describe('How clearly the song presents the gospel. ABSENT is not automatically a fault.'),
})
  // Thirty claims each carrying ten words is the whole song in inventory form.
  // The pool the later stages draw from is budgeted at the boundary too, so an
  // over-quoting extraction cannot smuggle a reconstruction downstream.
  .transform((value) => ({
    ...value,
    claims: applyQuotationBudget(value.claims, CLAIM_BUDGET).findings,
  }));
export type ClaimExtraction = z.infer<typeof ClaimExtractionSchema>;

// ---------------------------------------------------------------------------
// Stages 3-5 — component analyses
// ---------------------------------------------------------------------------

/**
 * Evidence.
 *
 * Every finding about the song must be *locatable*: it names where in the song
 * it comes from, so a reader can go there and disagree. Locating is required
 * of all of them, and costs nothing.
 *
 * Quoting is the scarce half. It is reserved for findings that turn on the
 * exact wording, because the review has only so many words of lyric to spend
 * (`applyQuotationBudget`) before it stops being commentary and starts being a
 * copy of the song. `evidenceCoverage()` reports both halves.
 */
const baseFinding = {
  category: z
    .string()
    .min(2)
    .max(80)
    .describe('Short category, e.g. "Christology", "Atonement", "Singability", "Ambiguous pronouns".'),
  title: z.string().min(3).max(160),
  explanation: z.string().min(20).max(MAX_EXPLANATION_CHARS),
  /** Required of every finding — this is what makes it checkable. */
  songLocation,
  locationDetail,
  /** Only where the exact wording is the point, and only within the review's budget. */
  lyricExcerpt,
};

export const StrengthSchema = z.object({
  ...baseFinding,
  magnitude: strengthMagnitude.describe(
    'MINOR = a genuine but modest positive. MODERATE = a substantial doctrinal strength. MAJOR = an outstanding, clearly-taught strength central to the faith.',
  ),
  scriptureReference: z.string().max(120).nullable().optional(),
  scriptureExcerpt,
  scriptureRationale: z.string().max(MAX_RATIONALE_CHARS).nullable().optional(),
});

export const ConcernSchema = z.object({
  ...baseFinding,
  severity: severity.describe(
    'MINOR = imprecision or avoidable vagueness. MODERATE = misleading wording or repeated ambiguity about an important doctrine. MAJOR = significant error about salvation, grace, Christ, sin or God. SEVERE = denial or fundamental distortion of a central Christian doctrine.',
  ),
  centrality: centrality.describe(
    'How central the affected doctrine is: CORE (gospel, God, Christ, salvation), IMPORTANT, or PERIPHERAL.',
  ),
  recurring: z
    .boolean()
    .default(false)
    .describe('True when the problem sits in the chorus/refrain or recurs, so it is sung repeatedly.'),
  scriptureReference: z.string().max(120).nullable().optional(),
  scriptureExcerpt,
  scriptureRationale: z
    .string()
    .max(MAX_RATIONALE_CHARS)
    .nullable()
    .optional()
    .describe('One sentence on why the cited passage bears on this concern.'),
});

export const TheologicalAnalysisSchema = z.object({
  strengths: z.array(StrengthSchema).max(12),
  concerns: z.array(ConcernSchema).max(12),
  doctrinesAffirmed: z.array(z.string().max(80)).max(25).default([]),
  assessment: z.string().min(20).max(MAX_ASSESSMENT_CHARS),
});
export type TheologicalAnalysis = z.infer<typeof TheologicalAnalysisSchema>;

/**
 * Measured vocal range.
 *
 * There is no estimate path on purpose. A guessed range is worse than a blank,
 * because a worship leader would act on it — so `measured` must be true and
 * the pitches must come off an actual chart, lead sheet or hymnal. If you have
 * not seen the notation, set measured=false and leave the pitches null.
 */
export const VocalRangeSchema = z.object({
  measured: z
    .boolean()
    .describe('True only if you have read these pitches off a chart, lead sheet or score. Never estimate.'),
  lowestNote: z
    .string()
    .max(6)
    .nullable()
    .optional()
    .describe('Lowest melody note in scientific pitch notation, e.g. "A3". Middle C is C4.'),
  highestNote: z.string().max(6).nullable().optional().describe('Highest melody note, e.g. "D5".'),
  tessituraLow: z.string().max(6).nullable().optional().describe('Where the melody mostly sits, low end.'),
  tessituraHigh: z.string().max(6).nullable().optional().describe('Where the melody mostly sits, high end.'),
  key: z
    .string()
    .max(60)
    .nullable()
    .optional()
    .describe('Key the measurement was taken in — the pitches mean nothing without it. May note alternates, e.g. "F (original); also in E".'),
  source: z.string().max(200).nullable().optional().describe('Where the notation was read: publisher, chart or hymnal.'),
  note: z.string().max(MAX_RATIONALE_CHARS).nullable().optional(),
});
export type VocalRange = z.infer<typeof VocalRangeSchema>;

export const CommunalAnalysisSchema = z.object({
  strengths: z.array(StrengthSchema).max(10),
  concerns: z.array(ConcernSchema).max(10),
  singability: z.enum(['EASY', 'MODERATE', 'DIFFICULT', 'VERY_DIFFICULT', 'UNKNOWN']).default('UNKNOWN'),
  vocalRangeNote: z.string().max(MAX_RATIONALE_CHARS).nullable().optional(),
  /** Measured pitches. Omit entirely rather than guessing. */
  range: VocalRangeSchema.optional().nullable(),
  repetitionAssessment: z
    .string()
    .max(MAX_RATIONALE_CHARS)
    .nullable()
    .optional()
    .describe('Distinguish meaningful/biblical repetition from empty repetition. Repetition is not a fault in itself.'),
  performanceOrientation: z.enum(['CONGREGATIONAL', 'BALANCED', 'PERFORMANCE_LEANING', 'PERFORMANCE']).default('BALANCED'),
  assessment: z.string().min(20).max(MAX_ASSESSMENT_CHARS),
});
export type CommunalAnalysis = z.infer<typeof CommunalAnalysisSchema>;

export const ClarityAnalysisSchema = z.object({
  strengths: z.array(StrengthSchema).max(10),
  concerns: z.array(ConcernSchema).max(10),
  ambiguityLevel: z.enum(['LOW', 'MODERATE', 'HIGH']).default('LOW'),
  assessment: z.string().min(20).max(MAX_ASSESSMENT_CHARS),
});
export type ClarityAnalysis = z.infer<typeof ClarityAnalysisSchema>;

// ---------------------------------------------------------------------------
// Stage 6 — synthesis
// ---------------------------------------------------------------------------

export const SynthesisSchema = z.object({
  summary: z
    .string()
    .min(40)
    .max(MAX_SUMMARY_CHARS)
    .describe('Two or three short sentences: the main strength, the most significant concern, and who it suits.'),
  themes: z
    .array(z.string().max(40))
    .max(8)
    .default([])
    .describe('Choose only from the supplied theme vocabulary.'),
  scriptureReferences: z
    .array(
      z.object({
        reference: z.string().min(2).max(120),
        excerpt: scriptureExcerpt,
        relevance: z.string().min(10).max(MAX_RELEVANCE_CHARS).describe('One short line.'),
      }),
    )
    .max(10)
    .default([]),
});
export type Synthesis = z.infer<typeof SynthesisSchema>;

// ---------------------------------------------------------------------------
// Artist research
// ---------------------------------------------------------------------------

export const ResearchSourceSchema = z.object({
  url: z.string().url().max(1000),
  title: z.string().min(2).max(400),
  publisher: z.string().max(200).nullable().optional(),
  author: z.string().max(200).nullable().optional(),
  publicationDate: z
    .string()
    .max(40)
    .nullable()
    .optional()
    .describe('ISO date (YYYY-MM-DD) when known, otherwise null. Never guess.'),
  sourceType,
  credibilityTier: credibilityTier.describe(
    'TIER_1 primary (official site, statement of faith, direct interview/sermon/book). TIER_2 highly reputable secondary (established theological organisations, academic work). TIER_3 general journalism. TIER_4 blogs, forums, social media.',
  ),
  summary: z.string().max(1200).nullable().optional(),
});

export const ArtistFindingSchema = z.object({
  component: z.enum(['DOCTRINE', 'AFFILIATIONS', 'PUBLIC_TEACHING', 'MINISTRY_CONTEXT']),
  category: z.string().min(2).max(80),
  title: z.string().min(3).max(160),
  explanation: z.string().min(20).max(MAX_EXPLANATION_CHARS),
  evidence: z
    .string()
    .max(MAX_EVIDENCE_CHARS)
    .nullable()
    .optional()
    .describe('A short factual excerpt or precise paraphrase of what the source actually says.'),
  evidenceGrade: evidenceGrade.describe(
    'DIRECT_STATEMENT = they said it themselves. DOCUMENTED_FACT = verifiable public record. CREDIBLE_REPORTING = reported by a reputable outlet. ALLEGATION = claimed but not established. INTERPRETATION = your reading of ambiguous material. THEOLOGICAL_INFERENCE = a doctrinal implication you are drawing.',
  ),
  /** Index into the `sources` array of the same payload. */
  sourceIndex: z.number().int().min(0).nullable().optional(),
});

export const ArtistStrengthSchema = ArtistFindingSchema.extend({ magnitude: strengthMagnitude });
export const ArtistConcernSchema = ArtistFindingSchema.extend({ severity });

export const ArtistResearchSchema = z.object({
  researchPossible: z
    .boolean()
    .describe('False when you cannot find sufficient public information to evaluate this artist responsibly.'),
  artistType: z.enum(['INDIVIDUAL', 'GROUP', 'MINISTRY', 'CHURCH', 'COLLECTIVE', 'UNKNOWN']),
  aliases: z.array(z.string().max(120)).max(10).default([]),
  country: z.string().max(80).nullable().optional(),
  foundedYear: z.number().int().min(1000).max(2200).nullable().optional(),
  websiteUrl: z.string().max(500).nullable().optional(),
  bio: z.string().max(400).nullable().optional(),
  strengths: z.array(ArtistStrengthSchema).max(12),
  concerns: z.array(ArtistConcernSchema).max(15),
  summary: z.string().min(40).max(MAX_SUMMARY_CHARS),
  evidenceCaveat: z
    .string()
    .max(MAX_ASSESSMENT_CHARS)
    .nullable()
    .optional()
    .describe('Populate when sources genuinely disagree. State both positions and say why nothing is treated as settled.'),
  sources: z.array(ResearchSourceSchema).max(25).default([]),
});
export type ArtistResearch = z.infer<typeof ArtistResearchSchema>;

/** Themes offered to the model. Kept closed so filtering stays coherent. */
export const THEME_VOCABULARY = [
  'God',
  'Trinity',
  'Christ',
  'Cross',
  'Resurrection',
  'Grace',
  'Salvation',
  'Sin',
  'Repentance',
  'Faith',
  'Holiness',
  'Worship',
  'Prayer',
  'Suffering',
  'Hope',
  'Heaven',
  'Mission',
  'Church',
  'Thanksgiving',
  'Creation',
  'Scripture',
  'Sovereignty',
  'Providence',
  'Assurance',
  'Lament',
  'Advent',
  'Communion',
  'Baptism',
] as const;

// ---------------------------------------------------------------------------
// Review-level quotation budget
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<string, number> = { SEVERE: 4, MAJOR: 3, MODERATE: 2, MINOR: 1 };
const CENTRALITY_RANK: Record<string, number> = { CORE: 3, IMPORTANT: 2, PERIPHERAL: 1 };

export interface Quotable {
  lyricExcerpt?: string | null;
  severity?: string;
  magnitude?: string;
  centrality?: string;
  recurring?: boolean;
}

export interface QuotationBudgetReport {
  /** Quotes surviving the budget. */
  kept: number;
  /** Lyric words across those quotes. */
  words: number;
  /** Quotes dropped because the review had already spent its budget. */
  droppedForBudget: number;
  /** Quotes dropped because another finding already quoted those words. */
  droppedAsDuplicate: number;
}

export interface QuotationBudget {
  maxQuotes: number;
  maxWords: number;
}

export const FINDING_BUDGET: QuotationBudget = {
  maxQuotes: MAX_QUOTED_FINDINGS,
  maxWords: MAX_FINDING_LYRIC_WORDS,
};

export const CLAIM_BUDGET: QuotationBudget = {
  maxQuotes: MAX_QUOTED_CLAIMS,
  maxWords: MAX_CLAIM_LYRIC_WORDS,
};

/**
 * Spends the review's quotation budget on the findings that most need it.
 *
 * Repairs rather than rejects, like the per-excerpt clamp above: an over-quoted
 * review is still a valid review, so the excess quotes are stripped and the
 * findings themselves survive untouched. Each keeps its location, so a finding
 * that loses its quote is still checkable — that is the trade this design
 * rests on.
 *
 * Priority is severity, then centrality, then whether the congregation repeats
 * it, then the order the reviewer wrote them in. The strongest claims are the
 * ones a reader is most likely to want to verify word-for-word, so they get
 * first call on the budget.
 */
export function applyQuotationBudget<T extends Quotable>(
  findings: T[],
  budget: QuotationBudget = FINDING_BUDGET,
): { findings: T[]; report: QuotationBudgetReport } {
  const contenders = findings
    .map((finding, index) => ({ finding, index }))
    .filter((entry) => Boolean(entry.finding.lyricExcerpt?.trim()))
    .sort((a, b) => {
      const rank = (f: Quotable) => SEVERITY_RANK[f.severity ?? f.magnitude ?? ''] ?? 0;
      const bySeverity = rank(b.finding) - rank(a.finding);
      if (bySeverity !== 0) return bySeverity;

      const byCentrality =
        (CENTRALITY_RANK[b.finding.centrality ?? ''] ?? 0) - (CENTRALITY_RANK[a.finding.centrality ?? ''] ?? 0);
      if (byCentrality !== 0) return byCentrality;

      const byRecurring = Number(Boolean(b.finding.recurring)) - Number(Boolean(a.finding.recurring));
      if (byRecurring !== 0) return byRecurring;

      return a.index - b.index;
    });

  const keep = new Set<number>();
  const kept: string[] = [];
  let words = 0;
  let droppedForBudget = 0;
  let droppedAsDuplicate = 0;

  for (const { finding, index } of contenders) {
    const excerpt = finding.lyricExcerpt!.trim();

    if (kept.some((existing) => excerptsOverlap(existing, excerpt))) {
      droppedAsDuplicate += 1;
      continue;
    }

    const cost = wordCount(excerpt);
    if (kept.length >= budget.maxQuotes || words + cost > budget.maxWords) {
      droppedForBudget += 1;
      continue;
    }

    keep.add(index);
    kept.push(excerpt);
    words += cost;
  }

  return {
    findings: findings.map((finding, index) =>
      !finding.lyricExcerpt?.trim() || keep.has(index) ? finding : { ...finding, lyricExcerpt: null },
    ),
    report: { kept: kept.length, words, droppedForBudget, droppedAsDuplicate },
  };
}

/**
 * How well a review can be checked.
 *
 * `grounded` is the number that matters: findings a reader can verify, whether
 * by the words shown or by the place named. `quoted` is reported alongside it
 * but is deliberately not maximised — quoting everything is the failure this
 * budget exists to prevent, not the goal.
 */
export function evidenceCoverage(
  findings: Array<{ lyricExcerpt?: string | null; songLocation?: string | null; category?: string }>,
): { quoted: number; located: number; grounded: number; total: number; ratio: number; quotedWords: number } {
  const total = findings.length;
  const hasQuote = (f: { lyricExcerpt?: string | null }) => Boolean(f.lyricExcerpt?.trim());
  const hasLocation = (f: { songLocation?: string | null }) => Boolean(f.songLocation && f.songLocation !== 'UNKNOWN');

  const quoted = findings.filter(hasQuote).length;
  const located = findings.filter(hasLocation).length;
  const grounded = findings.filter((f) => hasQuote(f) || hasLocation(f)).length;
  const quotedWords = findings
    .filter(hasQuote)
    .reduce((sum, f) => sum + wordCount(f.lyricExcerpt!.trim()), 0);

  return { quoted, located, grounded, total, ratio: total === 0 ? 1 : grounded / total, quotedWords };
}
