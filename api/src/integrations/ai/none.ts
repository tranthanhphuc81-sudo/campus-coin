import type { AiProvider, CategorizeInput, InsightInput } from "./provider.js";

export class NoneProvider implements AiProvider {
  readonly name = "none" as const;

  async categorize(_input: CategorizeInput, _signal: AbortSignal) {
    return null;
  }

  async generateInsight(_input: InsightInput, _signal: AbortSignal) {
    return null;
  }
}
