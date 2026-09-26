import { Prisma, InsightStatus } from "@prisma/client";
import { createAiProvider } from "../../integrations/ai/index.js";
import { config } from "../../config/env.js";
import { conflict, notFound } from "../../lib/problem.js";
import { prisma } from "../../lib/prisma.js";
import { computeMonthStats, toPromptStatsInput } from "./stats.js";
import { buildTemplateInsight, SUBSTITUTION_TIPS } from "./templates.js";
import { validateInsightText } from "./validator.js";
import type {
  CategoryHistoryMonth,
  CategoryMonthlyInput,
  InsightGenerationResult,
  MonthStatsSnapshot,
  PromptStatsInput,
} from "./types.js";

const provider = createAiProvider();

type Logger = {
  info: (message: string) => void;
  error: (message: string) => void;
};

const defaultLogger: Logger = {
  info: (message) => {
    process.stdout.write(`${message}\n`);
  },
  error: (message) => {
    process.stderr.write(`${message}\n`);
  },
};

function parseMonth(month: string): Date {
  const [yearToken, monthToken] = month.split("-");
  const year = Number(yearToken);
  const monthIndex = Number(monthToken) - 1;

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthIndex) ||
    monthIndex < 0 ||
    monthIndex > 11
  ) {
    throw notFound("Insight month was not found.");
  }

  return new Date(Date.UTC(year, monthIndex, 1));
}

function formatMonth(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthRangeStart(monthStart: Date): { from: Date; toExclusive: Date } {
  const from = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1));
  const toExclusive = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1),
  );
  return { from, toExclusive };
}

function addMonths(monthStart: Date, delta: number): Date {
  return new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + delta, 1));
}

function toMoney(value: Prisma.Decimal | null | undefined): string {
  return (value ?? new Prisma.Decimal(0)).toFixed(2);
}

function isRetryableLlmError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const text = `${error.name} ${error.message}`.toLowerCase();
  return text.includes("timeout") || text.includes("abort") || text.includes("429");
}

async function fetchMonthStatsInput(
  userId: string,
  month: string,
): Promise<{
  snapshot: MonthStatsSnapshot;
  promptStatsInput: PromptStatsInput;
}> {
  const monthStart = parseMonth(month);
  const { from: monthFrom, toExclusive: monthToExclusive } = monthRangeStart(monthStart);

  const [incomeAgg, expenseAgg, budgets, currentRows, historyRows] = await Promise.all([
    prisma.transaction.aggregate({
      where: {
        userId,
        deletedAt: null,
        type: "INCOME",
        txnDate: {
          gte: monthFrom,
          lt: monthToExclusive,
        },
      },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        userId,
        deletedAt: null,
        type: "EXPENSE",
        txnDate: {
          gte: monthFrom,
          lt: monthToExclusive,
        },
      },
      _sum: { amount: true },
    }),
    prisma.budget.findMany({
      where: {
        userId,
        month: monthFrom,
      },
      select: {
        categoryId: true,
        limitAmount: true,
      },
    }),
    prisma.transaction.findMany({
      where: {
        userId,
        deletedAt: null,
        type: "EXPENSE",
        txnDate: {
          gte: monthFrom,
          lt: monthToExclusive,
        },
      },
      select: {
        categoryId: true,
        amount: true,
        category: {
          select: {
            name: true,
          },
        },
      },
    }),
    prisma.transaction.findMany({
      where: {
        userId,
        deletedAt: null,
        type: "EXPENSE",
        txnDate: {
          gte: addMonths(monthStart, -3),
          lt: monthFrom,
        },
      },
      select: {
        categoryId: true,
        amount: true,
        txnDate: true,
        category: {
          select: {
            name: true,
          },
        },
      },
    }),
  ]);

  const prevMonths = [
    addMonths(monthStart, -1),
    addMonths(monthStart, -2),
    addMonths(monthStart, -3),
  ].map(formatMonth);

  const budgetByCategory = new Map<number, string>(
    budgets.map((item) => [item.categoryId, toMoney(item.limitAmount)]),
  );

  const categoryMap = new Map<
    number,
    { name: string; cur: Prisma.Decimal; history: Map<string, Prisma.Decimal> }
  >();

  for (const row of currentRows) {
    const existing = categoryMap.get(row.categoryId) ?? {
      name: row.category.name,
      cur: new Prisma.Decimal(0),
      history: new Map<string, Prisma.Decimal>(),
    };

    existing.cur = existing.cur.add(row.amount);
    categoryMap.set(row.categoryId, existing);
  }

  for (const row of historyRows) {
    const existing = categoryMap.get(row.categoryId) ?? {
      name: row.category.name,
      cur: new Prisma.Decimal(0),
      history: new Map<string, Prisma.Decimal>(),
    };

    const monthKey = formatMonth(
      new Date(Date.UTC(row.txnDate.getUTCFullYear(), row.txnDate.getUTCMonth(), 1)),
    );
    const oldValue = existing.history.get(monthKey) ?? new Prisma.Decimal(0);
    existing.history.set(monthKey, oldValue.add(row.amount));
    categoryMap.set(row.categoryId, existing);
  }

  const categories: CategoryMonthlyInput[] = [...categoryMap.entries()]
    .map(([categoryId, value]) => {
      const history: CategoryHistoryMonth[] = prevMonths.map((monthKey) => ({
        month: monthKey,
        amount: toMoney(value.history.get(monthKey)),
        hasActivity: (value.history.get(monthKey) ?? new Prisma.Decimal(0)).greaterThan(0),
      }));

      return {
        categoryId,
        name: value.name,
        cur: toMoney(value.cur),
        history,
        budgetLimit: budgetByCategory.get(categoryId) ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const snapshot = computeMonthStats({
    userId,
    month,
    currency: "USD",
    baselineAllowance: null,
    totalIncome: toMoney(incomeAgg._sum.amount),
    totalExpense: toMoney(expenseAgg._sum.amount),
    categories,
    largestAnomaly: null,
  });

  return {
    snapshot,
    promptStatsInput: toPromptStatsInput(snapshot, SUBSTITUTION_TIPS),
  };
}

async function callLlmWithRetry(input: PromptStatsInput): Promise<InsightGenerationResult | null> {
  if (provider.name === "none") {
    return null;
  }

  const attempts = [0, 2000, 8000, 32000];

  for (let index = 0; index < attempts.length; index += 1) {
    const delayMs = attempts[index] ?? 0;
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    try {
      const llm = await provider.generateInsight(
        { summaryStats: input },
        AbortSignal.timeout(config.AI_INSIGHT_TIMEOUT_MS),
      );

      if (!llm) {
        return null;
      }

      const checked = validateInsightText(
        {
          summaryText: llm.summaryText,
          tipText: llm.tipText,
        },
        input,
      );

      if (!checked.ok) {
        return null;
      }

      return {
        summaryText: llm.summaryText,
        tipText: llm.tipText,
        generator: "llm",
      };
    } catch (error) {
      const retryable = isRetryableLlmError(error);
      if (!retryable || index === attempts.length - 1) {
        return null;
      }
    }
  }

  return null;
}

async function writeInsightAndNotify(params: {
  userId: string;
  monthStart: Date;
  snapshot: MonthStatsSnapshot;
  generated: InsightGenerationResult;
  regenerateCountIncrement: number;
}): Promise<void> {
  const monthKey = formatMonth(params.monthStart);

  await prisma.$transaction(async (tx) => {
    await tx.insight.upsert({
      where: {
        userId_month: {
          userId: params.userId,
          month: params.monthStart,
        },
      },
      update: {
        status: InsightStatus.COMPLETED,
        summaryText: params.generated.summaryText,
        tipText: params.generated.tipText,
        statsSnapshot: params.snapshot,
        flaggedPatterns: params.snapshot.topPatterns,
        generator: params.generated.generator,
        regenerateCount: {
          increment: params.regenerateCountIncrement,
        },
      },
      create: {
        userId: params.userId,
        month: params.monthStart,
        status: InsightStatus.COMPLETED,
        summaryText: params.generated.summaryText,
        tipText: params.generated.tipText,
        statsSnapshot: params.snapshot,
        flaggedPatterns: params.snapshot.topPatterns,
        generator: params.generated.generator,
        regenerateCount: params.regenerateCountIncrement,
      },
    });

    await tx.notification.upsert({
      where: {
        userId_dedupeKey: {
          userId: params.userId,
          dedupeKey: `insight:${monthKey}`,
        },
      },
      update: {
        type: "INSIGHT_READY",
        title: `Insight ready for ${monthKey}`,
        body: "Your monthly insight is ready to review.",
        payload: { month: monthKey },
      },
      create: {
        userId: params.userId,
        type: "INSIGHT_READY",
        title: `Insight ready for ${monthKey}`,
        body: "Your monthly insight is ready to review.",
        payload: { month: monthKey },
        dedupeKey: `insight:${monthKey}`,
      },
    });
  });
}

export async function generateInsightForMonth(params: {
  userId: string;
  month: string;
  regenerateCountIncrement?: number;
  logger?: Logger;
}): Promise<void> {
  const logger = params.logger ?? defaultLogger;
  const monthStart = parseMonth(params.month);

  try {
    await prisma.insight.upsert({
      where: {
        userId_month: {
          userId: params.userId,
          month: monthStart,
        },
      },
      update: {
        status: InsightStatus.PROCESSING,
      },
      create: {
        userId: params.userId,
        month: monthStart,
        status: InsightStatus.PROCESSING,
        summaryText: "",
        tipText: "",
        statsSnapshot: {},
        flaggedPatterns: [],
        generator: "template",
      },
    });

    const { snapshot, promptStatsInput } = await fetchMonthStatsInput(params.userId, params.month);
    const llmResult = await callLlmWithRetry(promptStatsInput);
    const generated = llmResult ?? buildTemplateInsight(promptStatsInput);

    await writeInsightAndNotify({
      userId: params.userId,
      monthStart,
      snapshot,
      generated,
      regenerateCountIncrement: params.regenerateCountIncrement ?? 0,
    });
  } catch (error) {
    logger.error(
      `[insights.generate] Failed for user ${params.userId}, month ${params.month}: ${String(error)}`,
    );

    await prisma.insight
      .updateMany({
        where: {
          userId: params.userId,
          month: monthStart,
        },
        data: {
          status: InsightStatus.FAILED,
        },
      })
      .catch(() => undefined);
  }
}

export async function listInsights(userId: string) {
  const rows = await prisma.insight.findMany({
    where: { userId },
    orderBy: [{ month: "desc" }],
    select: {
      month: true,
      status: true,
      summaryText: true,
      tipText: true,
      generator: true,
      regenerateCount: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return rows.map((row) => ({
    month: formatMonth(row.month),
    status: row.status.toLowerCase(),
    summaryText: row.summaryText,
    tipText: row.tipText,
    generator: row.generator,
    regenerateCount: row.regenerateCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function getInsightByMonth(params: { userId: string; month: string }) {
  const row = await prisma.insight.findUnique({
    where: {
      userId_month: {
        userId: params.userId,
        month: parseMonth(params.month),
      },
    },
  });

  if (!row) {
    throw notFound("Insight was not found.");
  }

  return {
    month: formatMonth(row.month),
    status: row.status.toLowerCase(),
    summaryText: row.summaryText,
    tipText: row.tipText,
    generator: row.generator,
    regenerateCount: row.regenerateCount,
    statsSnapshot: row.statsSnapshot,
    flaggedPatterns: row.flaggedPatterns,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function queueInsightRegeneration(params: {
  userId: string;
  month: string;
}): Promise<void> {
  const monthStart = parseMonth(params.month);

  const existing = await prisma.insight.findUnique({
    where: {
      userId_month: {
        userId: params.userId,
        month: monthStart,
      },
    },
    select: {
      regenerateCount: true,
    },
  });

  const regenerateCount = existing?.regenerateCount ?? 0;
  if (regenerateCount >= 3) {
    throw conflict("You can regenerate an insight at most 3 times per month.");
  }

  await prisma.insight.upsert({
    where: {
      userId_month: {
        userId: params.userId,
        month: monthStart,
      },
    },
    update: {
      status: InsightStatus.QUEUED,
    },
    create: {
      userId: params.userId,
      month: monthStart,
      status: InsightStatus.QUEUED,
      summaryText: "",
      tipText: "",
      statsSnapshot: {},
      flaggedPatterns: [],
      generator: "template",
      regenerateCount,
    },
  });

  void generateInsightForMonth({
    userId: params.userId,
    month: params.month,
    regenerateCountIncrement: 1,
  });
}

export async function runMonthlyInsightGeneration(options?: {
  now?: Date;
  logger?: Logger;
}): Promise<{ processedUsers: number; succeededUsers: number; failedUsers: number }> {
  const now = options?.now ?? new Date();
  const logger = options?.logger ?? defaultLogger;
  const thisMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const targetMonth = addMonths(thisMonthStart, -1);
  const targetMonthKey = formatMonth(targetMonth);
  const { from, toExclusive } = monthRangeStart(targetMonth);

  const activeUsers = await prisma.transaction.groupBy({
    by: ["userId"],
    where: {
      deletedAt: null,
      txnDate: {
        gte: from,
        lt: toExclusive,
      },
      user: {
        deletedAt: null,
      },
    },
    _count: {
      _all: true,
    },
  });

  const candidates = activeUsers
    .filter((row) => row._count._all >= 5)
    .map((row) => row.userId)
    .sort((a, b) => a.localeCompare(b));

  let succeededUsers = 0;
  let failedUsers = 0;

  for (const userId of candidates) {
    try {
      await generateInsightForMonth({ userId, month: targetMonthKey, logger });
      const row = await prisma.insight.findUnique({
        where: {
          userId_month: {
            userId,
            month: targetMonth,
          },
        },
        select: {
          status: true,
        },
      });

      if (row?.status === InsightStatus.COMPLETED) {
        succeededUsers += 1;
      } else {
        failedUsers += 1;
      }
    } catch (error) {
      failedUsers += 1;
      logger.error(`[insights.monthly] Failed for user ${userId}: ${String(error)}`);
    }
  }

  return {
    processedUsers: candidates.length,
    succeededUsers,
    failedUsers,
  };
}
