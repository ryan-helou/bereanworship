import Anthropic from '@anthropic-ai/sdk';
import { z, type ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { env } from '../env';
import { log } from '../logger';

/**
 * Provider boundary for the review pipeline.
 *
 * Every stage returns *validated structured data*, obtained by forcing the
 * model through a tool call whose input schema is generated from the same Zod
 * schema we then parse with. There is no free-text parsing anywhere.
 *
 * The interface is injectable so tests can drive the entire pipeline with a
 * deterministic fake and never touch the network.
 */

export class AiNotConfiguredError extends Error {
  constructor() {
    super(
      'AI provider not configured. Set ANTHROPIC_API_KEY to run reviews. ' +
        'Browsing existing reviews does not require it.',
    );
    this.name = 'AiNotConfiguredError';
  }
}

export class AiOutputError extends Error {
  constructor(
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'AiOutputError';
  }
}

export interface StructuredRequest<T extends ZodTypeAny> {
  /** Short identifier used in logs and the job stage log. */
  stage: string;
  system: string;
  prompt: string;
  schema: T;
  toolName: string;
  toolDescription: string;
  maxTokens?: number;
  temperature?: number;
  /** Allow the model to use the hosted web-search tool before answering. */
  webSearch?: boolean;
  maxSearches?: number;
}

export interface StructuredResult<T> {
  data: T;
  /** URLs the model actually consulted via web search, when available. */
  citations: string[];
  usage: { inputTokens: number; outputTokens: number };
}

export interface AiProvider {
  structured<T extends ZodTypeAny>(request: StructuredRequest<T>): Promise<StructuredResult<z.infer<T>>>;
  readonly configured: boolean;
}

// ---------------------------------------------------------------------------
// Anthropic implementation
// ---------------------------------------------------------------------------

const WEB_SEARCH_TOOL_TYPE = 'web_search_20250305';
const MAX_TOOL_ROUNDS = 6;

class AnthropicProvider implements AiProvider {
  private client: Anthropic | null = null;
  /** Flipped off permanently if the account/model rejects the hosted search tool. */
  private webSearchAvailable = true;

  get configured(): boolean {
    return env.aiConfigured;
  }

  private getClient(): Anthropic {
    if (!env.aiConfigured) throw new AiNotConfiguredError();
    if (!this.client) {
      this.client = new Anthropic({
        apiKey: env.anthropicApiKey!,
        baseURL: env.anthropicBaseUrl,
        maxRetries: 3,
        timeout: 10 * 60 * 1000,
      });
    }
    return this.client;
  }

  async structured<T extends ZodTypeAny>(request: StructuredRequest<T>): Promise<StructuredResult<z.infer<T>>> {
    const client = this.getClient();
    const useSearch = Boolean(request.webSearch) && this.webSearchAvailable;

    const outputTool = {
      name: request.toolName,
      description: request.toolDescription,
      input_schema: toolInputSchema(request.schema),
    };

    try {
      return await this.run(client, request, outputTool, useSearch);
    } catch (error) {
      // If the hosted search tool is unavailable on this account, degrade to
      // analysis-without-search rather than failing the whole review. The
      // pipeline records that sources could not be gathered.
      if (useSearch && isToolUnsupportedError(error)) {
        this.webSearchAvailable = false;
        log.warn('ai.web_search_unavailable', { stage: request.stage });
        return this.run(client, request, outputTool, false);
      }
      throw error;
    }
  }

  private async run<T extends ZodTypeAny>(
    client: Anthropic,
    request: StructuredRequest<T>,
    outputTool: { name: string; description: string; input_schema: Record<string, unknown> },
    useSearch: boolean,
  ): Promise<StructuredResult<z.infer<T>>> {
    const tools: unknown[] = [outputTool];
    if (useSearch) {
      tools.unshift({
        type: WEB_SEARCH_TOOL_TYPE,
        name: 'web_search',
        max_uses: request.maxSearches ?? 6,
      });
    }

    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: request.prompt }];
    const citations = new Set<string>();
    let inputTokens = 0;
    let outputTokens = 0;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const isLastRound = round === MAX_TOOL_ROUNDS - 1;
      const response = await client.messages.create({
        model: env.anthropicModel,
        max_tokens: request.maxTokens ?? 8000,
        temperature: request.temperature ?? 0.2,
        system: request.system,
        messages,
        tools: tools as Anthropic.ToolUnion[],
        // With search enabled the model must be free to search first; once it
        // has, or on the final round, we force the structured answer.
        tool_choice:
          useSearch && !isLastRound
            ? { type: 'auto' }
            : { type: 'tool', name: outputTool.name },
      });

      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;

      collectCitations(response.content, citations);

      const submission = response.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use' && block.name === outputTool.name,
      );

      if (submission) {
        const parsed = request.schema.safeParse(submission.input);
        if (!parsed.success) {
          throw new AiOutputError(
            `Stage "${request.stage}" returned data that failed validation.`,
            parsed.error.flatten(),
          );
        }
        return {
          data: parsed.data,
          citations: [...citations],
          usage: { inputTokens, outputTokens },
        };
      }

      // The model used the hosted search tool: results are injected by the API,
      // so we simply continue the conversation.
      messages.push({ role: 'assistant', content: response.content });

      if (response.stop_reason !== 'tool_use') {
        messages.push({
          role: 'user',
          content: `Now call the ${outputTool.name} tool with your complete findings.`,
        });
      }
    }

    throw new AiOutputError(`Stage "${request.stage}" never produced a structured result.`);
  }
}

/** Server-tool result blocks carry the URLs the model actually read. */
function collectCitations(content: Anthropic.ContentBlock[], into: Set<string>): void {
  for (const block of content) {
    const anyBlock = block as unknown as Record<string, unknown>;
    if (anyBlock.type === 'web_search_tool_result' && Array.isArray(anyBlock.content)) {
      for (const item of anyBlock.content as Array<Record<string, unknown>>) {
        if (typeof item.url === 'string') into.add(item.url);
      }
    }
    if (anyBlock.type === 'text' && Array.isArray(anyBlock.citations)) {
      for (const citation of anyBlock.citations as Array<Record<string, unknown>>) {
        if (typeof citation.url === 'string') into.add(citation.url);
      }
    }
  }
}

function isToolUnsupportedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /web_search/i.test(message) &&
    /(not\s+(supported|available|enabled)|unsupported|invalid|unknown tool|permission)/i.test(message)
  );
}

/**
 * Zod → JSON Schema for the tool contract. Anthropic requires a top-level
 * object schema without `$ref` indirection, so definitions are inlined.
 */
function toolInputSchema(schema: ZodTypeAny): Record<string, unknown> {
  const json = zodToJsonSchema(schema, {
    $refStrategy: 'none',
    target: 'jsonSchema7',
  }) as Record<string, unknown>;

  delete json.$schema;
  delete json.definitions;
  if (json.type !== 'object') {
    throw new Error('Tool input schema must be an object at the top level.');
  }
  return json;
}

// ---------------------------------------------------------------------------
// Injection point
// ---------------------------------------------------------------------------

let provider: AiProvider = new AnthropicProvider();

export function getAiProvider(): AiProvider {
  return provider;
}

/** Test seam: swap in a deterministic fake. Returns a restore function. */
export function setAiProvider(next: AiProvider): () => void {
  const previous = provider;
  provider = next;
  return () => {
    provider = previous;
  };
}
