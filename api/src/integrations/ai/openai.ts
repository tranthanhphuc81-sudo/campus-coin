import {
  CATEGORY_SYSTEM_PROMPT,
  buildCategoryOutputSchema,
  buildCategoryUserPrompt,
  buildInsightOutputSchema,
  buildInsightUserPrompt,
  INSIGHT_SYSTEM_PROMPT,
  parseInsightOutput,
  parseCategorizeOutput,
  type AiProvider,
  type CategorizeInput,
  type InsightInput,
} from "./provider.js";

type OpenAiChoice = {
  message?: {
    content?: string;
  };
};

type OpenAiResponse = {
  choices?: OpenAiChoice[];
};

export class OpenAiProvider implements AiProvider {
  readonly name = "openai" as const;

  constructor(
    private readonly apiKey: string | undefined,
    private readonly categorizeTimeoutMs: number,
    private readonly insightTimeoutMs: number,
  ) {}

  async categorize(input: CategorizeInput, signal: AbortSignal) {
    if (!this.apiKey) {
      return null;
    }

    const allowedCategoryIds = input.allowedCategories.map((category) => category.id);
    const allowedSet = new Set(allowedCategoryIds);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: CATEGORY_SYSTEM_PROMPT },
          { role: "user", content: buildCategoryUserPrompt(input) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "categorize_result",
            strict: true,
            schema: buildCategoryOutputSchema(allowedCategoryIds),
          },
        },
      }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(this.categorizeTimeoutMs)]),
    }).catch(() => null);

    if (!response || !response.ok) {
      return null;
    }

    const body = (await response.json().catch(() => null)) as OpenAiResponse | null;
    const rawText = body?.choices?.[0]?.message?.content ?? "";

    if (!rawText.trim()) {
      return null;
    }

    return parseCategorizeOutput(rawText, allowedSet);
  }

  async generateInsight(input: InsightInput, signal: AbortSignal) {
    if (!this.apiKey) {
      return null;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          { role: "system", content: INSIGHT_SYSTEM_PROMPT },
          { role: "user", content: buildInsightUserPrompt(input) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "insight_result",
            strict: true,
            schema: buildInsightOutputSchema(),
          },
        },
      }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(this.insightTimeoutMs)]),
    }).catch(() => null);

    if (!response || !response.ok) {
      return null;
    }

    const body = (await response.json().catch(() => null)) as OpenAiResponse | null;
    const rawText = body?.choices?.[0]?.message?.content ?? "";

    if (!rawText.trim()) {
      return null;
    }

    return parseInsightOutput(rawText);
  }
}
