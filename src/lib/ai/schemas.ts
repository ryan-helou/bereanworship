import { z } from 'zod';
import { clampExcerpt, wordCount } from '../normalize';

/**
 * Structured contracts for every pipeline stage.
 *
 * The model never returns prose we parse by hand and never returns a score.
 * It returns validated findings; `src/lib/scoring.ts` turns those into
 * numbers. Anything that fails validation fails the job loudly rather than
 * being half-saved.
 */

export const MAX_LYRIC_WORDS = 10;
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
  location: z
    .enum(['VERSE', 'CHORUS', 'BRIDGE', 'REFRAIN', 'THROUGHOUT', 'UNKNOWN'])
    .default('UNKNOWN')
    .describe('Where in the song the claim sits. CHORUS/REFRAIN/THROUGHOUT means the congregation repeats it.'),
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
});
export type ClaimExtraction = z.infer<typeof ClaimExtractionSchema>;

// ---------------------------------------------------------------------------
// Stages 3-5 — component analyses
// ---------------------------------------------------------------------------

/**
 * Evidence.
 *
 * A finding about what a song says must carry the words. The exception is
 * narrow and real — you cannot quote an absence, a verse count or a melody —
 * but everything else quotes, because a reader has to be able to see what the
 * reviewer saw and disagree with it. `evidenceCoverage()` reports how well a
 * review holds to this.
 */
const baseFinding = {
  category: z
    .string()
    .min(2)
    .max(80)
    .describe('Short category, e.g. "Christology", "Atonement", "Singability", "Ambiguous pronouns".'),
  title: z.string().min(3).max(160),
  explanation: z.string().min(20).max(MAX_EXPLANATION_CHARS),
  /** Required unless the finding is about absence, structure or music. */
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

export const CommunalAnalysisSchema = z.object({
  strengths: z.array(StrengthSchema).max(10),
  concerns: z.array(ConcernSchema).max(10),
  singability: z.enum(['EASY', 'MODERATE', 'DIFFICULT', 'VERY_DIFFICULT', 'UNKNOWN']).default('UNKNOWN'),
  vocalRangeNote: z.string().max(MAX_RATIONALE_CHARS).nullable().optional(),
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

/**
 * How many findings show their evidence.
 *
 * Not a hard schema rule, because absence, structure and music findings
 * legitimately have nothing to quote — but a review where most findings assert
 * what a song says without showing it is a weak review, and this makes that
 * visible instead of letting it pass silently.
 */
export function evidenceCoverage(
  findings: Array<{ lyricExcerpt?: string | null; category?: string }>,
): { quoted: number; total: number; ratio: number } {
  const total = findings.length;
  const quoted = findings.filter((f) => Boolean(f.lyricExcerpt?.trim())).length;
  return { quoted, total, ratio: total === 0 ? 1 : quoted / total };
}
