import { describe, expect, it, vi } from "vitest";

import { type AiProvider } from "../../integrations/ai/provider.js";

import { createCategorizerService } from "./categorizer.service.js";

function buildProvider(
  name: AiProvider["name"],
  result: Awaited<ReturnType<AiProvider["categorize"]>>,
) {
  return {
    name,
    categorize: vi.fn(async () => result),
    generateInsight: vi.fn(async () => null),
  } satisfies AiProvider;
}

describe("CategorizerService", () => {
  it("lets layer 1 rule win over keyword", async () => {
    const provider = buildProvider("none", null);
    const service = createCategorizerService({
      provider,
      findCategories: async () => [
        { id: 10, name: "Food" },
        { id: 20, name: "Transport" },
      ],
      findUserRule: async () => ({ category_id: 20, hit_count: 2, consecutive_overrides: 0 }),
      resolveAiOptIn: async () => true,
      checkDailyQuota: async () => true,
      consumeDailyQuota: async () => undefined,
      upsertUserRule: async () => undefined,
      now: () => 1,
      cacheTtlMs: 1000,
      cacheMaxEntries: 10,
    });

    const result = await service.suggest({
      userId: "u1",
      description: "Campus Cafe",
      amount: "12.50",
      type: "expense",
    });

    expect(result).toMatchObject({
      categoryId: 20,
      source: "user_rule",
      confidence: 0.95,
    });
    expect(provider.categorize).not.toHaveBeenCalled();
  });

  it("rejects invalid LLM category output", async () => {
    const provider = buildProvider("openai", { categoryId: "999", confidence: 0.7 });

    const service = createCategorizerService({
      provider,
      findCategories: async () => [{ id: 10, name: "Food" }],
      findUserRule: async () => null,
      resolveAiOptIn: async () => true,
      checkDailyQuota: async () => true,
      consumeDailyQuota: async () => undefined,
      upsertUserRule: async () => undefined,
      now: () => 1,
      cacheTtlMs: 1000,
      cacheMaxEntries: 10,
    });

    const result = await service.suggest({
      userId: "u1",
      description: "Unknown merchant",
      amount: "12.50",
      type: "expense",
    });

    expect(result).toBeNull();
    expect(provider.categorize).toHaveBeenCalledOnce();
  });

  it("does not call provider when aiOptIn is false", async () => {
    const provider = buildProvider("openai", { categoryId: "10", confidence: 0.8 });

    const service = createCategorizerService({
      provider,
      findCategories: async () => [{ id: 10, name: "Food" }],
      findUserRule: async () => null,
      resolveAiOptIn: async () => false,
      checkDailyQuota: async () => true,
      consumeDailyQuota: async () => undefined,
      upsertUserRule: async () => undefined,
      now: () => 1,
      cacheTtlMs: 1000,
      cacheMaxEntries: 10,
    });

    const result = await service.suggest({
      userId: "u1",
      description: "Unknown merchant",
      amount: "12.50",
      type: "expense",
    });

    expect(result).toBeNull();
    expect(provider.categorize).not.toHaveBeenCalled();
  });

  it("scrubs PII before sending to provider", async () => {
    const provider = {
      name: "openai",
      categorize: vi.fn(async () => {
        return { categoryId: "10", confidence: 0.6 };
      }),
      generateInsight: vi.fn(async () => null),
    } satisfies AiProvider;

    const service = createCategorizerService({
      provider,
      findCategories: async () => [{ id: 10, name: "Food" }],
      findUserRule: async () => null,
      resolveAiOptIn: async () => true,
      checkDailyQuota: async () => true,
      consumeDailyQuota: async () => undefined,
      upsertUserRule: async () => undefined,
      now: () => 1,
      cacheTtlMs: 1000,
      cacheMaxEntries: 10,
    });

    await service.suggest({
      userId: "u1",
      description: "pay test@example.com 0912345678 card 1234 5678 9012 3456",
      amount: "12.50",
      type: "expense",
    });

    const firstCallInput = (
      provider.categorize as unknown as {
        mock: { calls: Array<Array<{ cleanedDescription: string }>> };
      }
    ).mock.calls[0]?.[0];

    expect(firstCallInput?.cleanedDescription).toContain("[EMAIL]");
    expect(firstCallInput?.cleanedDescription).toContain("[PHONE]");
    expect(firstCallInput?.cleanedDescription).toContain("[NUMBER]");
  });
});
