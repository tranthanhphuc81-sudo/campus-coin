import { config } from "../../config/env.js";

import { GeminiProvider } from "./gemini.js";
import { NoneProvider } from "./none.js";
import { OpenAiProvider } from "./openai.js";
import type { AiProvider } from "./provider.js";

export function createAiProvider(): AiProvider {
  if (config.AI_PROVIDER === "gemini") {
    return new GeminiProvider(config.GEMINI_API_KEY, config.AI_CATEGORIZE_TIMEOUT_MS);
  }

  if (config.AI_PROVIDER === "openai") {
    return new OpenAiProvider(config.OPENAI_API_KEY, config.AI_CATEGORIZE_TIMEOUT_MS);
  }

  return new NoneProvider();
}
