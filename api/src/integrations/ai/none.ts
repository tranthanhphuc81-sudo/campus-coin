import type { AiProvider } from "./provider.js";

export class NoneProvider implements AiProvider {
  readonly name = "none" as const;

  async categorize() {
    return null;
  }

  async generateInsight() {
    return null;
  }
}
