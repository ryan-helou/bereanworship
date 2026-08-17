import {
  ArtistResearchSchema,
  ClaimExtractionSchema,
  ClarityAnalysisSchema,
  CommunalAnalysisSchema,
  IdentificationSchema,
  SynthesisSchema,
  THEME_VOCABULARY,
  applyQuotationBudget,
  type ArtistResearch,
  type ClaimExtraction,
  type ClarityAnalysis,
  type CommunalAnalysis,
  type Identification,
  type SongLocation,
  type Substance,
  type Synthesis,
} from './schemas';
import {
  artistResearchPrompt,
  artistResearchSystem,
  claimExtractionPrompt,
  claimExtractionSystem,
  clarityPrompt,
  claritySystem,
  communalPrompt,
  communalSystem,
  identificationPrompt,
  identificationSystem,
  synthesisPrompt,
  synthesisSystem,
  theologicalPrompt,
  theologicalSystem,
} from './prompts';
import { TheologicalAnalysisSchema, type TheologicalAnalysis } from './schemas';
import { getAiProvider } from './client';
import {
  scoreArtist,
  scoreSong,
  songFindingImpact,
  artistFindingImpact,
  type ScorableArtistFinding,
  type ScorableSongFinding,
  type SongScoreResult,
  type ArtistScoreResult,
} from '../scoring';
import { log, events } from '../logger';
import type { ArtistComponent, Centrality, ScoreComponent, Severity } from '@prisma/client';

/**
 * The multi-stage review pipeline.
 *
 * Seven stages, each with its own prompt, its own schema and its own narrow
 * job. Nothing here asks a model to "rate this song" — the model produces
 * evidence-bearing findings, and `scoring.ts` turns those into numbers
 * deterministically. That separation is what makes every published score
 * reproducible and explainable.
 */

export type StageName =
  | 'identify'
  | 'extract_claims'
  | 'theological'
  | 'communal'
  | 'clarity'
  | 'synthesis'
  | 'score'
  | 'artist_research';

export interface StageRecord {
  stage: StageName;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  note?: string;
}

export type StageReporter = (stage: StageName, note?: string) => void | Promise<void>;

export class PipelineError extends Error {
  constructor(
    message: string,
    readonly stage: StageName,
    readonly retryable: boolean = true,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'PipelineError';
  }
}

/** Normalized finding shape shared by every component analysis. */
export interface PreparedSongFinding {
  type: 'STRENGTH' | 'CONCERN';
  component: ScoreComponent;
  severity: Severity;
  centrality: Centrality;
  recurring: boolean;
  /** Whether an ordinary singer takes the wrong meaning — see ConcernSchema. */
  likelihood: string;
  category: string;
  title: string;
  explanation: string;
  /** Where in the song this came from — how a finding stays checkable without a quote. */
  songLocation: SongLocation;
  locationDetail: string | null;
  lyricExcerpt: string | null;
  scriptureReference: string | null;
  scriptureExcerpt: string | null;
  scriptureRationale: string | null;
  scoreImpact: number;
}

export interface PreparedArtistFinding {
  type: 'STRENGTH' | 'CONCERN';
  component: ArtistComponent;
  severity: Severity;
  category: string;
  title: string;
  explanation: string;
  evidence: string | null;
  evidenceGrade: ArtistResearch['concerns'][number]['evidenceGrade'];
  contested: boolean;
  /**
   * True when the finding's evidence is too weak to enforce a MAJOR/SEVERE
   * penalty. Must reach the scorer: it governs both the penalty size and
   * whether the finding may impose a hard score ceiling.
   */
  cappedBySourceQuality: boolean;
  sourceIndex: number | null;
  scoreImpact: number;
}

export interface SongReviewResult {
  identification: Identification;
  claims: ClaimExtraction;
  /** The content checklist. Absent on pre-3.0.0 reviews. */
  substance?: Substance | null;
  theological: TheologicalAnalysis;
  communal: CommunalAnalysis;
  clarity: ClarityAnalysis;
  synthesis: Synthesis;
  findings: PreparedSongFinding[];
  scores: SongScoreResult;
  themes: string[];
  citations: string[];
  stages: StageRecord[];
  usage: { inputTokens: number; outputTokens: number };
}

export interface ArtistResearchResult {
  research: ArtistResearch;
  findings: PreparedArtistFinding[];
  scores: ArtistScoreResult;
  citations: string[];
  stages: StageRecord[];
  usage: { inputTokens: number; outputTokens: number };
}

// ---------------------------------------------------------------------------
// Song review
// ---------------------------------------------------------------------------

/**
 * Stage 1 in isolation.
 *
 * The worker needs the resolved artist *before* it can create database rows
 * (identity is artist-scoped), so identification is callable on its own and
 * the result is then handed to `runSongReview` as `known`.
 */
export async function identifySong(input: {
  title: string;
  artist?: string | null;
  notes?: string | null;
}): Promise<{ identification: Identification; citations: string[]; usage: { inputTokens: number; outputTokens: number } }> {
  const ai = getAiProvider();
  const res = await ai.structured({
    stage: 'identify',
    system: identificationSystem,
    prompt: identificationPrompt(input),
    schema: IdentificationSchema,
    toolName: 'submit_identification',
    toolDescription: 'Submit the confirmed identity of the worship song.',
    webSearch: true,
    maxSearches: 4,
    maxTokens: 3000,
  });

  if (!res.data.resolved) {
    throw new PipelineError(
      `Could not identify a song matching "${input.title}"${input.artist ? ` by ${input.artist}` : ''}. ` +
        `Check the spelling, or supply the artist to disambiguate.`,
      'identify',
      false,
    );
  }

  return { identification: res.data, citations: res.citations, usage: res.usage };
}

export interface SongReviewInput {
  title: string;
  artist?: string | null;
  notes?: string | null;
  /** Skip identification when the song is already resolved in the database. */
  known?: { title: string; artist: string; album?: string | null; releaseYear?: number | null; genre?: string | null };
  onStage?: StageReporter;
}

export async function runSongReview(input: SongReviewInput): Promise<SongReviewResult> {
  const ai = getAiProvider();
  const stages: StageRecord[] = [];
  const citations = new Set<string>();
  const usage = { inputTokens: 0, outputTokens: 0 };

  const track = async <T>(stage: StageName, note: string | undefined, fn: () => Promise<T>): Promise<T> => {
    const startedAt = new Date();
    await input.onStage?.(stage, note);
    log.info(events.jobStageChanged, { stage, title: input.title });
    const result = await fn();
    const finishedAt = new Date();
    stages.push({
      stage,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      note,
    });
    return result;
  };

  const absorb = (r: { citations: string[]; usage: { inputTokens: number; outputTokens: number } }) => {
    r.citations.forEach((c) => citations.add(c));
    usage.inputTokens += r.usage.inputTokens;
    usage.outputTokens += r.usage.outputTokens;
  };

  // --- Stage 1: identification -------------------------------------------
  let identification: Identification;
  if (input.known) {
    identification = {
      resolved: true,
      confidence: 'HIGH',
      title: input.known.title,
      artist: input.known.artist,
      artistType: 'UNKNOWN',
      album: input.known.album ?? null,
      releaseYear: input.known.releaseYear ?? null,
      genre: input.known.genre ?? null,
      isPublicDomain: false,
      notes: null,
    };
  } else {
    const res = await track('identify', 'Identifying song and artist', () =>
      ai.structured({
        stage: 'identify',
        system: identificationSystem,
        prompt: identificationPrompt({ title: input.title, artist: input.artist, notes: input.notes }),
        schema: IdentificationSchema,
        toolName: 'submit_identification',
        toolDescription: 'Submit the confirmed identity of the worship song.',
        webSearch: true,
        maxSearches: 4,
        maxTokens: 3000,
      }),
    );
    absorb(res);
    identification = res.data;

    if (!identification.resolved) {
      throw new PipelineError(
        `Could not identify a song matching "${input.title}"${input.artist ? ` by ${input.artist}` : ''}. ` +
          `Check the spelling, or supply the artist to disambiguate.`,
        'identify',
        false,
      );
    }
  }

  // --- Stage 2: claim extraction -----------------------------------------
  const claimsRes = await track('extract_claims', 'Extracting theological claims', () =>
    ai.structured({
      stage: 'extract_claims',
      system: claimExtractionSystem,
      prompt: claimExtractionPrompt({
        title: identification.title,
        artist: identification.artist,
        album: identification.album,
        releaseYear: identification.releaseYear,
      }),
      schema: ClaimExtractionSchema,
      toolName: 'submit_claims',
      toolDescription: 'Submit a neutral inventory of the theological claims the song makes.',
      webSearch: true,
      maxSearches: 3,
      maxTokens: 6000,
    }),
  );
  absorb(claimsRes);
  const claims = claimsRes.data;

  if (!claims.lyricsAvailable || claims.claims.length === 0) {
    // Refusing to analyse lyrics we do not have is a feature, not a failure.
    throw new PipelineError(
      `The lyrics of "${identification.title}" could not be established reliably, so no review was produced. ` +
        `Analysing a song from guessed lyrics would be worse than not reviewing it.`,
      'extract_claims',
      false,
    );
  }

  const claimsDigest = formatClaims(claims);

  // --- Stages 3-5: component analyses ------------------------------------
  // The artist is withheld from the theological stage on purpose: the score
  // must not be able to absorb anything about who made the record.
  const theological = await track('theological', 'Analysing biblical soundness', async () => {
    const res = await ai.structured({
      stage: 'theological',
      system: theologicalSystem,
      prompt: theologicalPrompt({
        title: identification.title,
        claims: claimsDigest,
        perspective: claims.perspective,
        gospelClarity: claims.gospelClarity,
        structuralNotes: claims.structuralNotes,
      }),
      schema: TheologicalAnalysisSchema,
      toolName: 'submit_theological_analysis',
      toolDescription: 'Submit the biblical and doctrinal assessment of the song.',
      maxTokens: 8000,
    });
    absorb(res);
    return res.data;
  });

  const communal = await track('communal', 'Assessing congregational suitability', async () => {
    const res = await ai.structured({
      stage: 'communal',
      system: communalSystem,
      prompt: communalPrompt({
        title: identification.title,
        artist: identification.artist,
        claims: claimsDigest,
        perspective: claims.perspective,
      }),
      schema: CommunalAnalysisSchema,
      toolName: 'submit_communal_analysis',
      toolDescription: 'Submit the congregational-suitability assessment of the song.',
      maxTokens: 6000,
    });
    absorb(res);
    return res.data;
  });

  const clarity = await track('clarity', 'Assessing clarity', async () => {
    const res = await ai.structured({
      stage: 'clarity',
      system: claritySystem,
      prompt: clarityPrompt({
        title: identification.title,
        claims: claimsDigest,
        structuralNotes: claims.structuralNotes,
      }),
      schema: ClarityAnalysisSchema,
      toolName: 'submit_clarity_analysis',
      toolDescription: 'Submit the clarity assessment of the song.',
      maxTokens: 6000,
    });
    absorb(res);
    return res.data;
  });

  // --- Stage 6: synthesis -------------------------------------------------
  const findings = prepareSongFindings({ theological, communal, clarity });

  const synthesis = await track('synthesis', 'Writing summary', async () => {
    const res = await ai.structured({
      stage: 'synthesis',
      system: synthesisSystem,
      prompt: synthesisPrompt({
        title: identification.title,
        artist: identification.artist,
        theologicalAssessment: theological.assessment,
        communalAssessment: communal.assessment,
        clarityAssessment: clarity.assessment,
        findingsDigest: formatFindingsDigest(findings),
      }),
      schema: SynthesisSchema,
      toolName: 'submit_synthesis',
      toolDescription: 'Submit the review summary, themes and Scripture references.',
      maxTokens: 4000,
    });
    absorb(res);
    return res.data;
  });

  // --- Stage 7: deterministic scoring ------------------------------------
  const scores = await track('score', 'Applying scoring methodology', async () =>
    scoreSong(findings as ScorableSongFinding[]),
  );

  const allowed = new Set<string>(THEME_VOCABULARY);
  const themes = [...new Set(synthesis.themes)].filter((t) => allowed.has(t));

  log.info(events.reviewCompleted, {
    title: identification.title,
    artist: identification.artist,
    overall: scores.overallScore,
    theological: scores.theologicalScore,
    communal: scores.communalScore,
    clarity: scores.clarityScore,
    findings: findings.length,
  });

  return {
    identification,
    claims,
    theological,
    communal,
    clarity,
    synthesis,
    findings,
    scores,
    themes,
    citations: [...citations],
    stages,
    usage,
  };
}

/** Turns the three component analyses into scored, persistable findings. */
export function prepareSongFindings(input: {
  theological: TheologicalAnalysis;
  communal: CommunalAnalysis;
  clarity: ClarityAnalysis;
}): PreparedSongFinding[] {
  const out: PreparedSongFinding[] = [];

  const push = (
    component: ScoreComponent,
    type: 'STRENGTH' | 'CONCERN',
    raw: {
      category: string;
      title: string;
      explanation: string;
      songLocation?: SongLocation;
      locationDetail?: string | null;
      lyricExcerpt?: string | null;
      scriptureReference?: string | null;
      scriptureExcerpt?: string | null;
      scriptureRationale?: string | null;
      severity?: Severity;
      magnitude?: 'MINOR' | 'MODERATE' | 'MAJOR';
      centrality?: Centrality;
      recurring?: boolean;
      likelihood?: string;
    },
  ) => {
    const severity: Severity = type === 'STRENGTH' ? (raw.magnitude ?? 'MINOR') : (raw.severity ?? 'MINOR');
    const centrality: Centrality = raw.centrality ?? 'IMPORTANT';
    const recurring = Boolean(raw.recurring);

    const finding: PreparedSongFinding = {
      type,
      component,
      severity,
      centrality,
      recurring,
      likelihood: raw.likelihood ?? 'POSSIBLE',
      category: raw.category,
      title: raw.title,
      explanation: raw.explanation,
      songLocation: raw.songLocation ?? 'UNKNOWN',
      locationDetail: raw.locationDetail ?? null,
      lyricExcerpt: raw.lyricExcerpt ?? null,
      scriptureReference: raw.scriptureReference ?? null,
      scriptureExcerpt: raw.scriptureExcerpt ?? null,
      scriptureRationale: raw.scriptureRationale ?? null,
      scoreImpact: 0,
    };
    finding.scoreImpact = songFindingImpact(finding);
    out.push(finding);
  };

  for (const s of input.theological.strengths) push('THEOLOGICAL', 'STRENGTH', s);
  for (const c of input.theological.concerns) push('THEOLOGICAL', 'CONCERN', c);
  for (const s of input.communal.strengths) push('COMMUNAL', 'STRENGTH', s);
  for (const c of input.communal.concerns) push('COMMUNAL', 'CONCERN', c);
  for (const s of input.clarity.strengths) push('CLARITY', 'STRENGTH', s);
  for (const c of input.clarity.concerns) push('CLARITY', 'CONCERN', c);

  // The three analyses are produced independently and cannot see each other's
  // quotes, so the budget is spent here — the one point where the whole
  // review's quotation is visible at once. Both the worker and the manual
  // path come through this function, so neither can bypass it.
  const { findings, report } = applyQuotationBudget(out);
  if (report.droppedForBudget > 0 || report.droppedAsDuplicate > 0) {
    log.info('review.quotation_budget', {
      kept: report.kept,
      words: report.words,
      droppedForBudget: report.droppedForBudget,
      droppedAsDuplicate: report.droppedAsDuplicate,
      note: 'Excess lyric quotes stripped. The findings themselves are unchanged and remain located.',
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Artist research
// ---------------------------------------------------------------------------

export interface ArtistResearchInput {
  name: string;
  knownFor?: string | null;
  onStage?: StageReporter;
}

export async function runArtistResearch(input: ArtistResearchInput): Promise<ArtistResearchResult> {
  const ai = getAiProvider();
  const startedAt = new Date();
  await input.onStage?.('artist_research', `Researching ${input.name}`);
  log.info(events.researchStarted, { artist: input.name });

  const res = await ai.structured({
    stage: 'artist_research',
    system: artistResearchSystem,
    prompt: artistResearchPrompt({ name: input.name, knownFor: input.knownFor }),
    schema: ArtistResearchSchema,
    toolName: 'submit_artist_research',
    toolDescription: 'Submit sourced findings on the artist or ministry\'s theological position.',
    webSearch: true,
    maxSearches: 10,
    maxTokens: 12000,
    temperature: 0.1,
  });

  const research = res.data;

  if (!research.researchPossible) {
    throw new PipelineError(
      `Insufficient public information to evaluate "${input.name}" responsibly. ` +
        `An unsupported score is worse than no score.`,
      'artist_research',
      false,
    );
  }

  const findings = prepareArtistFindings(research);
  const scores = scoreArtist(findings as ScorableArtistFinding[]);

  const finishedAt = new Date();
  log.info(events.artistResearchCompleted, {
    artist: input.name,
    overall: scores.overallScore,
    findings: findings.length,
    sources: research.sources.length,
  });

  return {
    research,
    findings,
    scores,
    citations: res.citations,
    stages: [
      {
        stage: 'artist_research',
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      },
    ],
    usage: res.usage,
  };
}

/**
 * Applies the source-quality gate before scoring: a serious accusation resting
 * only on tier-4 evidence, or graded merely as an allegation, cannot carry a
 * MAJOR or SEVERE penalty. It is still published — flagged as contested — but
 * it is scored as MODERATE at most.
 */
export function prepareArtistFindings(research: ArtistResearch): PreparedArtistFinding[] {
  const out: PreparedArtistFinding[] = [];
  const sources = research.sources;

  const sourceTier = (index: number | null | undefined): string | null => {
    if (index === null || index === undefined) return null;
    return sources[index]?.credibilityTier ?? null;
  };

  for (const s of research.strengths) {
    const finding: PreparedArtistFinding = {
      type: 'STRENGTH',
      component: s.component,
      severity: s.magnitude,
      category: s.category,
      title: s.title,
      explanation: s.explanation,
      evidence: s.evidence ?? null,
      evidenceGrade: s.evidenceGrade,
      contested: false,
      cappedBySourceQuality: false,
      sourceIndex: s.sourceIndex ?? null,
      scoreImpact: 0,
    };
    finding.scoreImpact = artistFindingImpact({ type: 'STRENGTH', component: s.component, severity: s.magnitude });
    out.push(finding);
  }

  for (const c of research.concerns) {
    const tier = sourceTier(c.sourceIndex);
    const weakEvidence =
      tier === 'TIER_4' ||
      tier === null ||
      c.evidenceGrade === 'ALLEGATION' ||
      c.evidenceGrade === 'INTERPRETATION';

    const capped = weakEvidence && (c.severity === 'MAJOR' || c.severity === 'SEVERE');

    const finding: PreparedArtistFinding = {
      type: 'CONCERN',
      component: c.component,
      severity: c.severity,
      category: c.category,
      title: c.title,
      explanation: c.explanation,
      evidence: c.evidence ?? null,
      evidenceGrade: c.evidenceGrade,
      contested: capped || c.evidenceGrade === 'ALLEGATION',
      cappedBySourceQuality: capped,
      sourceIndex: c.sourceIndex ?? null,
      scoreImpact: 0,
    };
    finding.scoreImpact = artistFindingImpact({
      type: 'CONCERN',
      component: c.component,
      severity: c.severity,
      cappedBySourceQuality: capped,
    });
    out.push(finding);
  }

  return out;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatClaims(claims: ClaimExtraction): string {
  return claims.claims
    .map((c, i) => {
      const parts = [`${i + 1}. [${c.subject} · ${c.location}] ${c.claim}`];
      if (c.lyricExcerpt) parts.push(`   evidence: "${c.lyricExcerpt}"`);
      return parts.join('\n');
    })
    .join('\n');
}

function formatFindingsDigest(findings: PreparedSongFinding[]): string {
  const strengths = findings.filter((f) => f.type === 'STRENGTH');
  const concerns = findings.filter((f) => f.type === 'CONCERN');

  const lines: string[] = [];
  lines.push('Strengths:');
  if (strengths.length === 0) lines.push('  (none recorded)');
  for (const s of strengths) lines.push(`  · [${s.component}/${s.severity}] ${s.title}`);
  lines.push('Concerns:');
  if (concerns.length === 0) lines.push('  (none recorded)');
  for (const c of concerns) {
    lines.push(`  · [${c.component}/${c.severity}/${c.centrality}${c.recurring ? '/recurring' : ''}] ${c.title}`);
  }
  return lines.join('\n');
}
