/**
 * gemini.provider.ts
 * Google Gemini implementation of {@link JsonLlmProvider} (default AI_PROVIDER). Calls the
 * `generateContent` REST endpoint with the API key in the `x-goog-api-key` HEADER (never the URL,
 * so it can never end up logged in an access log or a browser/proxy history).
 * Main exports: GeminiProvider
 * Spec: docs/spec/05b (AI categorization, tier 3) · docs/spec/09 §9.9 (never leak the API key)
 */
import { z } from 'zod';
import { AiProviderError } from '../errors.js';
import { postJson } from '../http.js';
import { JsonLlmProvider } from './base.provider.js';
import { AI_LLM_MAX_OUTPUT_TOKENS } from '@campuscoin/shared';

/** Minimal envelope of a Gemini `generateContent` response — only the fields this adapter reads. */
const geminiResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({
          parts: z.array(z.object({ text: z.string() })).min(1),
        }),
      }),
    )
    .min(1),
});

export interface GeminiProviderOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
}

/** Google Gemini Flash (or any Gemini model) provider. */
export class GeminiProvider extends JsonLlmProvider {
  readonly name = 'gemini';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly defaultTimeoutMs: number;

  constructor(options: GeminiProviderOptions) {
    super();
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.defaultTimeoutMs = options.timeoutMs;
  }

  protected async completeJson(system: string, user: string, timeoutMs?: number): Promise<unknown> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        maxOutputTokens: AI_LLM_MAX_OUTPUT_TOKENS,
      },
    };

    const raw = await postJson(url, body, {
      // API key in a header, never the URL query string (never logged/cached anywhere with the URL).
      headers: { 'x-goog-api-key': this.apiKey },
      timeoutMs: timeoutMs ?? this.defaultTimeoutMs,
    });

    const parsed = geminiResponseSchema.safeParse(raw);
    if (!parsed.success) throw new AiProviderError('invalid_output');

    const text = parsed.data.candidates[0]?.content.parts[0]?.text;
    if (typeof text !== 'string') throw new AiProviderError('invalid_output');

    try {
      return JSON.parse(text);
    } catch {
      throw new AiProviderError('invalid_output');
    }
  }
}
