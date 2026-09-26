import { CategoryType } from "@prisma/client";
import { createHash } from "node:crypto";

import { config } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { createAiProvider } from "../../integrations/ai/index.js";
import type { AiProvider } from "../../integrations/ai/provider.js";

import { suggestFromKeywords } from "./keywords.js";
import { normalizeMerchantKey, scrubPii } from "./normalize.js";
import type { FeedbackInput, SuggestCategoryInput, SuggestCategoryResult } from "./types.js";

type CategoryOption = {
  id: number;
  name: string;
};

type UserRuleRow = {
  category_id: number;
  hit_count: number;
  consecutive_overrides: number;
};

type UsageRow = {
  call_count: number;
};

type AiOptInRow = {
  ai_opt_in: boolean | number | null;
};

type LlmCacheEntry = {
  value: SuggestCategoryResult;
  expiresAt: number;
};

type CategorizerDeps = {
  provider: AiProvider;
  findCategories: (userId: string, type: "income" | "expense") => Promise<CategoryOption[]>;
  findUserRule: (userId: string, merchantKey: string) => Promise<UserRuleRow | null>;
  resolveAiOptIn: (userId: string) => Promise<boolean>;
  checkDailyQuota: (userId: string) => Promise<boolean>;
  consumeDailyQuota: (userId: string) => Promise<void>;
  upsertUserRule: (params: {
    userId: string;
    merchantKey: string;
    chosenCategoryId: number;
    suggestedCategoryId: number | null;
  }) => Promise<void>;
  now: () => number;
  cacheTtlMs: number;
  cacheMaxEntries: number;
};

function toCategoryType(input: "income" | "expense"): CategoryType {
  return input === "income" ? CategoryType.INCOME : CategoryType.EXPENSE;
}

function pickFallbackCategoryId(categories: CategoryOption[]): number | null {
  const preferred = categories.find((category) => category.name.toLowerCase() === "miscellaneous");
  return preferred?.id ?? categories[0]?.id ?? null;
}

function makeCacheKey(merchantKey: string | null, categoryIds: number[]): string {
  const normalizedMerchant = merchantKey ?? "";
  const normalizedCategoryIds = [...categoryIds].sort((a, b) => a - b).join(",");
  return createHash("sha256")
    .update(`${normalizedMerchant}|${normalizedCategoryIds}`)
    .digest("hex");
}

function createDefaultDeps(): CategorizerDeps {
  return {
    provider: createAiProvider(),
    findCategories: async (userId, type) =>
      prisma.category.findMany({
        where: {
          type: toCategoryType(type),
          isActive: true,
          OR: [{ isDefault: true }, { userId }],
        },
        select: {
          id: true,
          name: true,
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
    findUserRule: async (userId, merchantKey) => {
      const rows = await prisma.$queryRaw<UserRuleRow[]>`
        SELECT category_id, hit_count, consecutive_overrides
        FROM ai_category_rules
        WHERE user_id = ${userId} AND merchant_key = ${merchantKey}
        LIMIT 1
      `;
      return rows[0] ?? null;
    },
    resolveAiOptIn: async (userId) => {
      try {
        const rows = await prisma.$queryRaw<AiOptInRow[]>`
          SELECT ai_opt_in
          FROM users
          WHERE id = ${userId}
          LIMIT 1
        `;
        const value = rows[0]?.ai_opt_in;
        return value === true || value === 1;
      } catch {
        return false;
      }
    },
    checkDailyQuota: async (userId) => {
      const rows = await prisma.$queryRaw<UsageRow[]>`
        SELECT call_count
        FROM ai_usage_daily
        WHERE user_id = ${userId} AND usage_date = CURRENT_DATE()
        LIMIT 1
      `;
      const count = rows[0]?.call_count ?? 0;
      return count < config.AI_DAILY_QUOTA;
    },
    consumeDailyQuota: async (userId) => {
      await prisma.$executeRaw`
        INSERT INTO ai_usage_daily (user_id, usage_date, call_count)
        VALUES (${userId}, CURRENT_DATE(), 1)
        ON DUPLICATE KEY UPDATE call_count = call_count + 1
      `;
    },
    upsertUserRule: async ({ userId, merchantKey, chosenCategoryId, suggestedCategoryId }) => {
      const existingRows = await prisma.$queryRaw<UserRuleRow[]>`
        SELECT category_id, hit_count, consecutive_overrides
        FROM ai_category_rules
        WHERE user_id = ${userId} AND merchant_key = ${merchantKey}
        LIMIT 1
      `;

      const existing = existingRows[0] ?? null;
      if (!existing) {
        await prisma.$executeRaw`
          INSERT INTO ai_category_rules
            (user_id, merchant_key, category_id, hit_count, consecutive_overrides, last_used_at)
          VALUES (${userId}, ${merchantKey}, ${chosenCategoryId}, 1, 0, NOW())
        `;
        return;
      }

      const accepted = suggestedCategoryId !== null && chosenCategoryId === suggestedCategoryId;
      if (accepted || chosenCategoryId === existing.category_id) {
        await prisma.$executeRaw`
          UPDATE ai_category_rules
          SET category_id = ${chosenCategoryId},
              hit_count = hit_count + 1,
              consecutive_overrides = 0,
              last_used_at = NOW()
          WHERE user_id = ${userId} AND merchant_key = ${merchantKey}
        `;
        return;
      }

      if (existing.consecutive_overrides + 1 >= 2) {
        await prisma.$executeRaw`
          UPDATE ai_category_rules
          SET category_id = ${chosenCategoryId},
              hit_count = 1,
              consecutive_overrides = 0,
              last_used_at = NOW()
          WHERE user_id = ${userId} AND merchant_key = ${merchantKey}
        `;
        return;
      }

      await prisma.$executeRaw`
        UPDATE ai_category_rules
        SET consecutive_overrides = consecutive_overrides + 1,
            last_used_at = NOW()
        WHERE user_id = ${userId} AND merchant_key = ${merchantKey}
      `;
    },
    now: () => Date.now(),
    cacheTtlMs: config.AI_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000,
    cacheMaxEntries: config.AI_CACHE_MAX_ENTRIES,
  };
}

export class CategorizerService {
  private readonly cache = new Map<string, LlmCacheEntry>();

  constructor(private readonly deps: CategorizerDeps) {}

  private readCache(key: string): SuggestCategoryResult | undefined {
    const cached = this.cache.get(key);
    if (!cached) {
      return undefined;
    }

    if (cached.expiresAt <= this.deps.now()) {
      this.cache.delete(key);
      return undefined;
    }

    this.cache.delete(key);
    this.cache.set(key, cached);
    return cached.value;
  }

  private writeCache(key: string, value: SuggestCategoryResult): void {
    if (this.cache.size >= this.deps.cacheMaxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: this.deps.now() + this.deps.cacheTtlMs,
    });
  }

  async suggest(input: SuggestCategoryInput): Promise<SuggestCategoryResult> {
    void input.amount;

    const categories = await this.deps.findCategories(input.userId, input.type);
    if (categories.length === 0) {
      return null;
    }

    const cleanedDescription = scrubPii(input.description);
    const merchantKey = normalizeMerchantKey(cleanedDescription);

    if (merchantKey) {
      const userRule = await this.deps.findUserRule(input.userId, merchantKey);
      if (userRule) {
        const category = categories.find((item) => item.id === userRule.category_id);
        if (category) {
          return {
            categoryId: category.id,
            categoryName: category.name,
            confidence: userRule.hit_count >= 2 ? 0.95 : 0.8,
            source: "user_rule",
          };
        }
      }

      const keywordSuggestion = suggestFromKeywords(merchantKey, categories);
      if (keywordSuggestion) {
        return {
          categoryId: keywordSuggestion.categoryId,
          categoryName: keywordSuggestion.categoryName,
          confidence: keywordSuggestion.confidence,
          source: "keyword",
        };
      }
    }

    const aiOptIn = await this.deps.resolveAiOptIn(input.userId);
    if (!aiOptIn || this.deps.provider.name === "none") {
      return null;
    }

    const cacheKey = makeCacheKey(
      merchantKey,
      categories.map((category) => category.id),
    );
    const fromCache = this.readCache(cacheKey);
    if (fromCache !== undefined) {
      return fromCache;
    }

    const canUseLlm = await this.deps.checkDailyQuota(input.userId);
    if (!canUseLlm) {
      this.writeCache(cacheKey, null);
      return null;
    }

    const fallbackCategoryId = pickFallbackCategoryId(categories);
    if (!fallbackCategoryId) {
      this.writeCache(cacheKey, null);
      return null;
    }

    await this.deps.consumeDailyQuota(input.userId);

    const llmResult = await this.deps.provider.categorize(
      {
        cleanedDescription,
        allowedCategories: categories.map((category) => ({
          id: String(category.id),
          name: category.name,
        })),
        fallbackCategoryId: String(fallbackCategoryId),
      },
      AbortSignal.timeout(config.AI_CATEGORIZE_TIMEOUT_MS),
    );

    if (!llmResult) {
      this.writeCache(cacheKey, null);
      return null;
    }

    const categoryId = Number.parseInt(llmResult.categoryId, 10);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      this.writeCache(cacheKey, null);
      return null;
    }

    const selectedCategory = categories.find((category) => category.id === categoryId);
    if (!selectedCategory) {
      this.writeCache(cacheKey, null);
      return null;
    }

    const confidence = Math.min(Math.max(llmResult.confidence, 0), 0.9);
    const suggestion: SuggestCategoryResult = {
      categoryId,
      categoryName: selectedCategory.name,
      confidence,
      source: "llm",
    };

    this.writeCache(cacheKey, suggestion);
    return suggestion;
  }

  async submitFeedback(input: FeedbackInput): Promise<void> {
    const cleanedDescription = scrubPii(input.description);
    const merchantKey = normalizeMerchantKey(cleanedDescription);
    if (!merchantKey) {
      return;
    }

    await this.deps.upsertUserRule({
      userId: input.userId,
      merchantKey,
      chosenCategoryId: input.chosenCategoryId,
      suggestedCategoryId: input.suggestedCategoryId,
    });
  }
}

export function createCategorizerService(deps?: Partial<CategorizerDeps>) {
  const base = createDefaultDeps();

  return new CategorizerService({
    ...base,
    ...deps,
  });
}

export const categorizerService = createCategorizerService();
