/**
 * openai.provider.ts
 * OpenAI implementation of {@link JsonLlmProvider} (alternative AI_PROVIDER). Calls the
 * `chat/completions` REST endpoint with `Authorization: Bearer <key>` and `response_format:
 * {type:'json_object'}` — json_object mode requires a top-level JSON object, so the reply is
 * expected wrapped as `{"results":[...]}` (D6), same shape `parseCategorizeOutput` expects.
 * Main exports: OpenAiProvider
 * Spec: docs/spec/05b (AI categorization, tier 3)
 */
import { z } from 'zod';
import { AiProviderError } from '../errors.js';
import { postJson } from '../http.js';
import { JsonLlmProvider } from './base.provider.js';
import { AI_LLM_MAX_OUTPUT_TOKENS } from '@campuscoin/shared';

/** Minimal envelope of an OpenAI chat/completions response — only the fields this adapter reads. */
const openAiResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string() }),
      }),
    )
    .min(1),
});

export interface OpenAiProviderOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
}

/** OpenAI chat-completions provider. */
export class OpenAiProvider extends JsonLlmProvider {
  readonly name = 'openai';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly defaultTimeoutMs: number;

  constructor(options: OpenAiProviderOptions) {
    super();
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.defaultTimeoutMs = options.timeoutMs;
  }

  protected async completeJson(system: string, user: string, timeoutMs?: number): Promise<unknown> {
    const url = 'https://api.openai.com/v1/chat/completions';
    const body = {
      model: this.model,
      // Some newer OpenAI models reject a non-default `temperature`; omit it entirely.
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_completion_tokens: AI_LLM_MAX_OUTPUT_TOKENS,
    };

    const raw = await postJson(url, body, {
      headers: { authorization: `Bearer ${this.apiKey}` },
      timeoutMs: timeoutMs ?? this.defaultTimeoutMs,
    });

    const parsed = openAiResponseSchema.safeParse(raw);
    if (!parsed.success) throw new AiProviderError('invalid_output');

    const content = parsed.data.choices[0]?.message.content;
    if (typeof content !== 'string') throw new AiProviderError('invalid_output');

    try {
      return JSON.parse(content);
    } catch {
      throw new AiProviderError('invalid_output');
    }
  }
}
