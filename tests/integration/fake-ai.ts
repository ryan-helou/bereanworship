import type { AiProvider, StructuredRequest, StructuredResult } from '@/lib/ai/client';
import type { ZodTypeAny, z } from 'zod';

/**
 * Deterministic stand-in for the Anthropic provider.
 *
 * Lets the integration tests drive the entire review pipeline — identification
 * through scoring and persistence — with zero network calls and zero tokens,
 * and with results stable enough to assert exact scores against.
 *
 * Responses are keyed by tool name, so each pipeline stage gets a plausible,
 * schema-valid payload. Every response is still validated by the real Zod
 * schema inside the pipeline, so a schema regression fails the tests.
 */

export interface FakeAiOptions {
  /** Override a specific stage's response, or make one throw. */
  overrides?: Partial<Record<string, unknown | (() => never)>>;
  /** Records the prompts each stage received, for bias assertions. */
  capture?: { prompts: Array<{ stage: string; system: string; prompt: string }> };
}

export function createFakeAi(options: FakeAiOptions = {}): AiProvider {
  const { overrides = {}, capture } = options;

  return {
    configured: true,

    async structured<T extends ZodTypeAny>(request: StructuredRequest<T>): Promise<StructuredResult<z.infer<T>>> {
      capture?.prompts.push({ stage: request.stage, system: request.system, prompt: request.prompt });

      const override = overrides[request.toolName];
      if (typeof override === 'function') {
        (override as () => never)();
      }

      const payload = override ?? defaultFor(request.toolName);
      // Parse through the real schema: the fake cannot drift from the contract.
      const parsed = request.schema.parse(payload);

      return {
        data: parsed,
        citations: ['https://example.org/statement-of-faith', 'https://example.org/interview'],
        usage: { inputTokens: 100, outputTokens: 200 },
      };
    },
  };
}

function defaultFor(toolName: string): unknown {
  switch (toolName) {
    case 'submit_identification':
      return {
        resolved: true,
        confidence: 'HIGH',
        title: 'Test Song',
        artist: 'Test Artist',
        artistType: 'GROUP',
        album: 'Test Album',
        releaseYear: 2020,
        genre: 'Modern Worship',
        isPublicDomain: false,
        notes: null,
      };

    case 'submit_claims':
      return {
        lyricsAvailable: true,
        perspective: 'CORPORATE_WE',
        structuralNotes: 'Verse, chorus, bridge.',
        gospelClarity: 'EXPLICIT',
        claims: [
          {
            claim: 'God is holy and worthy of worship.',
            subject: 'Doctrine of God',
            location: 'VERSE',
            lyricExcerpt: 'holy is the Lord',
          },
          {
            claim: 'Salvation comes through Christ alone.',
            subject: 'Salvation',
            location: 'CHORUS',
            lyricExcerpt: null,
          },
        ],
      };

    case 'submit_theological_analysis':
      return {
        assessment: 'The song presents God accurately and states the gospel without distortion.',
        doctrinesAffirmed: ['Holiness of God', 'Salvation by grace'],
        strengths: [
          {
            category: 'Doctrine of God',
            title: 'Clear statement of God’s holiness',
            explanation: 'The song grounds worship in who God is rather than in how the singer feels about Him.',
            magnitude: 'MAJOR',
            scriptureReference: 'Isaiah 6:3',
            scriptureRationale: 'The seraphim’s cry establishes holiness as the defining attribute in view.',
            lyricExcerpt: 'holy is the Lord',
            scriptureExcerpt: null,
          },
        ],
        concerns: [
          {
            category: 'Precision',
            title: 'One imprecise phrase about grace',
            explanation: 'A line could be read as making grace conditional, though the surrounding verse resolves it.',
            severity: 'MINOR',
            centrality: 'IMPORTANT',
            recurring: false,
            scriptureReference: 'Ephesians 2:8',
            scriptureRationale: 'Grace is a gift, not a transaction.',
            lyricExcerpt: null,
            scriptureExcerpt: null,
          },
        ],
      };

    case 'submit_communal_analysis':
      return {
        assessment: 'Comfortably within reach of an ordinary congregation.',
        singability: 'EASY',
        vocalRangeNote: 'Roughly an octave.',
        repetitionAssessment: 'The refrain repeats meaningfully rather than emptily.',
        performanceOrientation: 'CONGREGATIONAL',
        strengths: [
          {
            category: 'Singability',
            title: 'Narrow, comfortable range',
            explanation: 'The melody stays within a range most congregations can sing without strain.',
            magnitude: 'MODERATE',
            lyricExcerpt: null,
            scriptureReference: null,
            scriptureExcerpt: null,
            scriptureRationale: null,
          },
        ],
        concerns: [],
      };

    case 'submit_clarity_analysis':
      return {
        assessment: 'Plain language carrying identifiable doctrine.',
        ambiguityLevel: 'LOW',
        strengths: [
          {
            category: 'Clarity',
            title: 'Unambiguous referents throughout',
            explanation: 'It is always clear who is being addressed and on what basis.',
            magnitude: 'MODERATE',
            lyricExcerpt: null,
            scriptureReference: null,
            scriptureExcerpt: null,
            scriptureRationale: null,
          },
        ],
        concerns: [],
      };

    case 'submit_synthesis':
      return {
        summary:
          'A clear, Christ-centred song that states the gospel plainly and sits comfortably in congregational range. One phrase about grace is slightly imprecise but is resolved by its context.',
        themes: ['God', 'Grace', 'Salvation', 'Worship'],
        scriptureReferences: [
          { reference: 'Isaiah 6:3', excerpt: null, relevance: 'The holiness the song is built around.' },
          { reference: 'Ephesians 2:8', excerpt: null, relevance: 'Grace as gift, bearing on the flagged phrase.' },
        ],
      };

    case 'submit_artist_research':
      return {
        researchPossible: true,
        artistType: 'GROUP',
        aliases: ['Test Artist Collective'],
        country: 'United States',
        foundedYear: 2005,
        websiteUrl: 'https://example.org',
        bio: 'A fictional worship group used in tests.',
        summary:
          'Publishes an orthodox statement of faith. One area of public teaching raises a moderate concern, evidenced by a reputable secondary source.',
        evidenceCaveat: null,
        strengths: [
          {
            component: 'DOCTRINE',
            category: 'Statement of faith',
            title: 'Orthodox published statement of faith',
            explanation: 'Their published statement affirms the Trinity and salvation by grace through faith.',
            evidence: 'The statement of faith affirms the deity of Christ.',
            evidenceGrade: 'DIRECT_STATEMENT',
            magnitude: 'MAJOR',
            sourceIndex: 0,
          },
        ],
        concerns: [
          {
            component: 'PUBLIC_TEACHING',
            category: 'Gospel clarity',
            title: 'A sermon series blurred the basis of assurance',
            explanation: 'Published teaching located assurance partly in the believer’s performance.',
            evidence: 'Recorded teaching from the ministry’s own channel.',
            evidenceGrade: 'DIRECT_STATEMENT',
            severity: 'MODERATE',
            sourceIndex: 1,
          },
        ],
        sources: [
          {
            url: 'https://example.org/statement-of-faith',
            title: 'Statement of Faith',
            publisher: 'Test Artist',
            author: null,
            publicationDate: '2020-01-15',
            sourceType: 'STATEMENT_OF_FAITH',
            credibilityTier: 'TIER_1',
            summary: 'The ministry’s own doctrinal statement.',
          },
          {
            url: 'https://example.org/interview',
            title: 'Interview with the worship pastor',
            publisher: 'Example Journal',
            author: 'A Journalist',
            publicationDate: '2022-06-01',
            sourceType: 'INTERVIEW',
            credibilityTier: 'TIER_2',
            summary: 'A long-form interview covering their theology of worship.',
          },
        ],
      };

    default:
      throw new Error(`Fake AI has no response for tool "${toolName}"`);
  }
}
