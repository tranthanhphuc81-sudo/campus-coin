import { Prisma, TransactionType, type TipRuleType as PrismaTipRuleType } from "@prisma/client";

import { prisma } from "../../lib/prisma.js";

const DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";

type UserTipWithTemplate = {
  id: bigint;
  userId: string;
  templateId: number;
  categoryId: number | null;
  period: Date;
  renderedTitle: string;
  renderedBody: string;
  impactAmount: Prisma.Decimal;
  score: Prisma.Decimal;
  status: "ACTIVE" | "PINNED" | "DISMISSED";
  dismissedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
  template: {
    id: number;
    code: string;
    ruleType: PrismaTipRuleType;
  };
};

export type TipTemplateRecord = {
  id: number;
  code: string;
  ruleType:
    | "over_budget"
    | "above_average"
    | "small_frequent"
    | "subscriptions"
    | "savings_gap"
    | "weekend_spike"
    | "general";
  titleTpl: string;
  bodyTpl: string;
};

export type TipRecalculationContext = {
  timezone: string;
  monthStart: Date;
  monthEndExclusive: Date;
  now: Date;
  daysElapsed: number;
  daysInMonth: number;
  monthlySavingsGoal: Prisma.Decimal | null;
  allowanceBaseline: Prisma.Decimal | null;
  categorySpending: Array<{
    categoryId: number;
    categoryName: string;
    spentToDate: Prisma.Decimal;
    avg3: Prisma.Decimal;
    historicalMonths: number;
    budgetLimit: Prisma.Decimal | null;
  }>;
  recentExpenseTransactions: Array<{ categoryId: number; amount: Prisma.Decimal; txnDate: Date }>;
  recurringSubscriptions: Array<{
    categoryId: number;
    categoryName: string;
    amount: Prisma.Decimal;
  }>;
  monthIncome: Prisma.Decimal;
  projectedTotalExpense: Prisma.Decimal;
  templates: TipTemplateRecord[];
  existingPeriodTips: UserTipWithTemplate[];
  activeDismissals: Array<{ ruleType: TipTemplateRecord["ruleType"]; categoryId: number | null }>;
};

function startOfMonthUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonthsUtc(date: Date, delta: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1));
}

function getDatePartsInTimezone(
  date: Date,
  timezone: string,
): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value ?? "1970"),
    month: Number(parts.find((part) => part.type === "month")?.value ?? "1"),
    day: Number(parts.find((part) => part.type === "day")?.value ?? "1"),
  };
}

function getRuleTypeWireName(ruleType: PrismaTipRuleType): TipTemplateRecord["ruleType"] {
  switch (ruleType) {
    case "OVER_BUDGET":
      return "over_budget";
    case "ABOVE_AVERAGE":
      return "above_average";
    case "SMALL_FREQUENT":
      return "small_frequent";
    case "SUBSCRIPTIONS":
      return "subscriptions";
    case "SAVINGS_GAP":
      return "savings_gap";
    case "WEEKEND_SPIKE":
      return "weekend_spike";
    case "GENERAL":
      return "general";
  }
}

function parseRuleTypeToPrisma(ruleType: TipTemplateRecord["ruleType"]): PrismaTipRuleType {
  switch (ruleType) {
    case "over_budget":
      return "OVER_BUDGET";
    case "above_average":
      return "ABOVE_AVERAGE";
    case "small_frequent":
      return "SMALL_FREQUENT";
    case "subscriptions":
      return "SUBSCRIPTIONS";
    case "savings_gap":
      return "SAVINGS_GAP";
    case "weekend_spike":
      return "WEEKEND_SPIKE";
    case "general":
      return "GENERAL";
  }
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export async function findLatestTipsRefreshAt(userId: string, period: Date): Promise<Date | null> {
  const row = await prisma.userTip.findFirst({
    where: {
      userId,
      period,
      status: { in: ["ACTIVE", "PINNED"] },
    },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });

  return row?.updatedAt ?? null;
}

export async function buildTipRecalculationContext(
  userId: string,
  now: Date,
): Promise<TipRecalculationContext> {
  const timezone = DEFAULT_TIMEZONE;
  const parts = getDatePartsInTimezone(now, timezone);
  const monthStart = new Date(Date.UTC(parts.year, parts.month - 1, 1));
  const monthEndExclusive = addMonthsUtc(monthStart, 1);

  const daysElapsed = parts.day;
  const totalDays = daysInMonth(parts.year, parts.month);

  const previousThreeMonths = [1, 2, 3].map((offset) => addMonthsUtc(monthStart, -offset));
  const oldMonthStart = previousThreeMonths[2] ?? addMonthsUtc(monthStart, -3);

  const [
    spendingRows,
    previousMonthRows,
    budgetRows,
    recentRows,
    subscriptionRows,
    monthIncome,
    monthExpense,
    templates,
    existingPeriodTips,
    activeDismissals,
  ] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["categoryId"],
      where: {
        userId,
        type: TransactionType.EXPENSE,
        deletedAt: null,
        txnDate: {
          gte: monthStart,
          lt: monthEndExclusive,
        },
      },
      _sum: { amount: true },
    }),
    prisma.transaction.groupBy({
      by: ["categoryId", "txnDate"],
      where: {
        userId,
        type: TransactionType.EXPENSE,
        deletedAt: null,
        txnDate: {
          gte: oldMonthStart,
          lt: monthStart,
        },
      },
      _sum: { amount: true },
    }),
    prisma.budget.findMany({
      where: {
        userId,
        month: monthStart,
      },
      select: {
        categoryId: true,
        limitAmount: true,
      },
    }),
    prisma.transaction.findMany({
      where: {
        userId,
        type: TransactionType.EXPENSE,
        deletedAt: null,
        txnDate: {
          gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
          lte: now,
        },
      },
      select: {
        categoryId: true,
        amount: true,
        txnDate: true,
      },
    }),
    prisma.recurringRule.findMany({
      where: {
        userId,
        isActive: true,
        type: TransactionType.EXPENSE,
        category: {
          name: "Subscriptions",
        },
      },
      select: {
        categoryId: true,
        category: { select: { name: true } },
        amount: true,
      },
    }),
    prisma.transaction.aggregate({
      where: {
        userId,
        deletedAt: null,
        type: TransactionType.INCOME,
        txnDate: {
          gte: monthStart,
          lt: monthEndExclusive,
        },
      },
      _sum: {
        amount: true,
      },
    }),
    prisma.transaction.aggregate({
      where: {
        userId,
        deletedAt: null,
        type: TransactionType.EXPENSE,
        txnDate: {
          gte: monthStart,
          lt: monthEndExclusive,
        },
      },
      _sum: {
        amount: true,
      },
    }),
    prisma.tipTemplate.findMany({
      where: {
        isActive: true,
        locale: "en",
      },
      orderBy: [{ ruleType: "asc" }, { id: "asc" }],
      select: {
        id: true,
        code: true,
        ruleType: true,
        titleTpl: true,
        bodyTpl: true,
      },
    }),
    prisma.userTip.findMany({
      where: {
        userId,
        period: monthStart,
      },
      include: {
        template: {
          select: {
            id: true,
            code: true,
            ruleType: true,
          },
        },
      },
    }),
    prisma.userTip.findMany({
      where: {
        userId,
        status: "DISMISSED",
        dismissedUntil: {
          gte: now,
        },
      },
      include: {
        template: {
          select: {
            ruleType: true,
          },
        },
      },
    }),
  ]);

  const categoryNames = await prisma.category.findMany({
    where: {
      userId,
      id: {
        in: [...new Set(spendingRows.map((row) => row.categoryId))],
      },
    },
    select: {
      id: true,
      name: true,
    },
  });

  const categoryNameMap = new Map(categoryNames.map((row) => [row.id, row.name] as const));

  const budgetMap = new Map<number, Prisma.Decimal>(
    budgetRows.map((row) => [row.categoryId, row.limitAmount] as const),
  );

  const monthTotalsByCategory = new Map<number, Map<string, Prisma.Decimal>>();

  for (const row of previousMonthRows) {
    const key = row.txnDate.toISOString().slice(0, 7);
    const forCategory =
      monthTotalsByCategory.get(row.categoryId) ?? new Map<string, Prisma.Decimal>();
    const current = forCategory.get(key) ?? new Prisma.Decimal(0);
    forCategory.set(key, current.add(row._sum.amount ?? new Prisma.Decimal(0)));
    monthTotalsByCategory.set(row.categoryId, forCategory);
  }

  const categorySpending = spendingRows.map((row) => {
    const monthlyMap =
      monthTotalsByCategory.get(row.categoryId) ?? new Map<string, Prisma.Decimal>();
    const monthValues = [...monthlyMap.values()];
    const historicalMonths = monthValues.length;
    const avg3 =
      historicalMonths === 0
        ? new Prisma.Decimal(0)
        : monthValues
            .reduce((acc, value) => acc.add(value), new Prisma.Decimal(0))
            .div(historicalMonths)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

    return {
      categoryId: row.categoryId,
      categoryName: categoryNameMap.get(row.categoryId) ?? "Other",
      spentToDate: row._sum.amount ?? new Prisma.Decimal(0),
      avg3,
      historicalMonths,
      budgetLimit: budgetMap.get(row.categoryId) ?? null,
    };
  });

  return {
    timezone,
    monthStart,
    monthEndExclusive,
    now,
    daysElapsed,
    daysInMonth: totalDays,
    monthlySavingsGoal: null,
    allowanceBaseline: null,
    categorySpending,
    recentExpenseTransactions: recentRows,
    recurringSubscriptions: subscriptionRows.map((row) => ({
      categoryId: row.categoryId,
      categoryName: row.category.name,
      amount: row.amount,
    })),
    monthIncome: monthIncome._sum.amount ?? new Prisma.Decimal(0),
    projectedTotalExpense: monthExpense._sum.amount ?? new Prisma.Decimal(0),
    templates: templates.map((template) => ({
      id: template.id,
      code: template.code,
      ruleType: getRuleTypeWireName(template.ruleType),
      titleTpl: template.titleTpl,
      bodyTpl: template.bodyTpl,
    })),
    existingPeriodTips: existingPeriodTips as UserTipWithTemplate[],
    activeDismissals: activeDismissals.map((item) => ({
      ruleType: getRuleTypeWireName(item.template.ruleType),
      categoryId: item.categoryId,
    })),
  };
}

export async function replaceActiveTipsForMonth(params: {
  userId: string;
  monthStart: Date;
  rows: Array<{
    templateId: number;
    categoryId: number | null;
    renderedTitle: string;
    renderedBody: string;
    impactAmount: Prisma.Decimal;
    score: Prisma.Decimal;
  }>;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.userTip.deleteMany({
      where: {
        userId: params.userId,
        period: params.monthStart,
        status: "ACTIVE",
      },
    });

    if (params.rows.length === 0) {
      return;
    }

    for (const row of params.rows) {
      await tx.userTip.create({
        data: {
          userId: params.userId,
          templateId: row.templateId,
          categoryId: row.categoryId,
          period: params.monthStart,
          renderedTitle: row.renderedTitle,
          renderedBody: row.renderedBody,
          impactAmount: row.impactAmount,
          score: row.score,
          status: "ACTIVE",
        },
      });
    }
  });
}

export async function listVisibleTips(params: {
  userId: string;
  monthStart: Date;
}): Promise<UserTipWithTemplate[]> {
  const rows = await prisma.userTip.findMany({
    where: {
      userId: params.userId,
      period: params.monthStart,
      OR: [
        { status: "ACTIVE" },
        { status: "PINNED" },
        {
          status: "DISMISSED",
          dismissedUntil: {
            lt: new Date(),
          },
        },
      ],
    },
    include: {
      template: {
        select: {
          id: true,
          code: true,
          ruleType: true,
        },
      },
    },
    orderBy: [{ status: "asc" }, { score: "desc" }, { id: "desc" }],
  });

  return rows as UserTipWithTemplate[];
}

export async function findTipById(params: { userId: string; tipId: bigint }) {
  return prisma.userTip.findFirst({
    where: {
      userId: params.userId,
      id: params.tipId,
    },
  });
}

export async function updateTipStatus(params: {
  tipId: bigint;
  status: "ACTIVE" | "PINNED" | "DISMISSED";
  dismissedUntil?: Date | null;
}) {
  return prisma.userTip.update({
    where: {
      id: params.tipId,
    },
    data: {
      status: params.status,
      dismissedUntil: params.dismissedUntil ?? null,
    },
  });
}

export function toWireRuleType(ruleType: PrismaTipRuleType): TipTemplateRecord["ruleType"] {
  return getRuleTypeWireName(ruleType);
}

export function toPrismaRuleType(ruleType: TipTemplateRecord["ruleType"]): PrismaTipRuleType {
  return parseRuleTypeToPrisma(ruleType);
}

export function resolveMonthStart(now: Date, timezone: string): Date {
  const parts = getDatePartsInTimezone(now, timezone);
  return startOfMonthUtc(new Date(Date.UTC(parts.year, parts.month - 1, 1)));
}
