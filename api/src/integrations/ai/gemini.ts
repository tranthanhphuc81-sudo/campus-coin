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

type GeminiContentPart = {
  text?: string;
};

type GeminiCandidate = {
  content?: {
    parts?: GeminiContentPart[];
  };
};

type GeminiResponse = {
  candidates?: GeminiCandidate[];
};

export class GeminiProvider implements AiProvider {
  readonly name = "gemini" as const;

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

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(this.apiKey)}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: CATEGORY_SYSTEM_PROMPT }],
          },
          contents: [{ parts: [{ text: buildCategoryUserPrompt(input) }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: buildCategoryOutputSchema(allowedCategoryIds),
          },
        }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(this.categorizeTimeoutMs)]),
      },
    ).catch(() => null);

    if (!response || !response.ok) {
      return null;
    }

    const body = (await response.json().catch(() => null)) as GeminiResponse | null;
    const rawText =
      body?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";

    if (!rawText.trim()) {
      return null;
    }

    return parseCategorizeOutput(rawText, allowedSet);
  }

  async generateInsight(input: InsightInput, signal: AbortSignal) {
    if (!this.apiKey) {
      return null;
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(this.apiKey)}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: INSIGHT_SYSTEM_PROMPT }],
          },
          contents: [{ parts: [{ text: buildInsightUserPrompt(input) }] }],
          generationConfig: {
            temperature: 0.3,
            responseMimeType: "application/json",
            responseSchema: buildInsightOutputSchema(),
          },
        }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(this.insightTimeoutMs)]),
      },
    ).catch(() => null);

    if (!response || !response.ok) {
      return null;
    }

    const body = (await response.json().catch(() => null)) as GeminiResponse | null;
    const rawText =
      body?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";

    if (!rawText.trim()) {
      return null;
    }

    return parseInsightOutput(rawText);
  }
}
