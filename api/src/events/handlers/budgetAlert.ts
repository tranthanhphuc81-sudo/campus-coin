import { Prisma } from "@prisma/client";

import {
  type TransactionCreatedEvent,
  type TransactionDeletedEvent,
  type TransactionRestoredEvent,
  type TransactionUpdatedEvent,
  domainEventBus,
} from "../bus.js";
import { prisma } from "../../lib/prisma.js";

type BudgetImpact = {
  userId: string;
  categoryId: number;
  monthStart: Date;
};

type TransactionPoint = {
  userId: string;
  categoryId: number;
  txnDate: string;
  type: "income" | "expense";
};

let handlerRegistered = false;

function parseDateOnly(input: string): Date {
  return new Date(`${input}T00:00:00.000Z`);
}

function getMonthStart(dateOnly: string): Date {
  const date = parseDateOnly(dateOnly);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function getMonthKey(monthStart: Date): string {
  const year = monthStart.getUTCFullYear();
  const month = String(monthStart.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function dedupeKey(budgetId: number, level: "near" | "exceeded", monthStart: Date): string {
  return `budget:${budgetId}:${level}:${getMonthKey(monthStart)}`;
}

function toBudgetImpact(point: TransactionPoint): BudgetImpact | null {
  if (point.type !== "expense") {
    return null;
  }

  return {
    userId: point.userId,
    categoryId: point.categoryId,
    monthStart: getMonthStart(point.txnDate),
  };
}

function uniqueImpacts(impacts: Array<BudgetImpact | null>): BudgetImpact[] {
  const result: BudgetImpact[] = [];
  const seen = new Set<string>();

  for (const impact of impacts) {
    if (!impact) {
      continue;
    }

    const key = `${impact.userId}:${impact.categoryId}:${impact.monthStart.toISOString()}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(impact);
  }

  return result;
}

function computeImpactsFromCreated(payload: TransactionCreatedEvent): BudgetImpact[] {
  return uniqueImpacts([
    toBudgetImpact({
      userId: payload.userId,
      categoryId: payload.categoryId,
      txnDate: payload.txnDate,
      type: payload.type,
    }),
  ]);
}

function computeImpactsFromUpdated(payload: TransactionUpdatedEvent): BudgetImpact[] {
  return uniqueImpacts([toBudgetImpact(payload.before), toBudgetImpact(payload.after)]);
}

function computeImpactsFromDeleted(payload: TransactionDeletedEvent): BudgetImpact[] {
  return uniqueImpacts([toBudgetImpact(payload.transaction)]);
}

function computeImpactsFromRestored(payload: TransactionRestoredEvent): BudgetImpact[] {
  return uniqueImpacts([toBudgetImpact(payload.transaction)]);
}

async function syncSingleBudgetAlert(impact: BudgetImpact): Promise<void> {
  const budget = await prisma.budget.findFirst({
    where: {
      userId: impact.userId,
      categoryId: impact.categoryId,
      month: impact.monthStart,
    },
    include: {
      category: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!budget) {
    return;
  }

  const monthEnd = new Date(
    Date.UTC(impact.monthStart.getUTCFullYear(), impact.monthStart.getUTCMonth() + 1, 1),
  );

  const aggregate = await prisma.transaction.aggregate({
    where: {
      userId: impact.userId,
      categoryId: impact.categoryId,
      type: "EXPENSE",
      deletedAt: null,
      txnDate: {
        gte: impact.monthStart,
        lt: monthEnd,
      },
    },
    _sum: {
      amount: true,
    },
  });

  const spent = aggregate._sum.amount ?? new Prisma.Decimal(0);
  const thresholdAmount = budget.limitAmount.mul(budget.alertThresholdPct).div(100);
  const monthKey = getMonthKey(impact.monthStart);

  const nearKey = dedupeKey(budget.id, "near", impact.monthStart);
  const exceededKey = dedupeKey(budget.id, "exceeded", impact.monthStart);

  if (spent.greaterThanOrEqualTo(budget.limitAmount)) {
    const title = `Budget exceeded: ${budget.category.name}`;
    const body = `You have spent ${spent.toFixed(2)} in ${budget.category.name} for ${monthKey}, above your limit ${budget.limitAmount.toFixed(2)}.`;

    await prisma.notification.upsert({
      where: {
        userId_dedupeKey: {
          userId: impact.userId,
          dedupeKey: exceededKey,
        },
      },
      update: {
        title,
        body,
        payload: {
          budgetId: budget.id,
          categoryId: budget.categoryId,
          month: monthKey,
          spent: spent.toFixed(2),
          limitAmount: budget.limitAmount.toFixed(2),
          level: "exceeded",
        },
      },
      create: {
        userId: impact.userId,
        type: "BUDGET_EXCEEDED",
        title,
        body,
        payload: {
          budgetId: budget.id,
          categoryId: budget.categoryId,
          month: monthKey,
          spent: spent.toFixed(2),
          limitAmount: budget.limitAmount.toFixed(2),
          level: "exceeded",
        },
        dedupeKey: exceededKey,
      },
    });
  } else {
    await prisma.notification.updateMany({
      where: {
        userId: impact.userId,
        dedupeKey: exceededKey,
      },
      data: {
        dedupeKey: null,
      },
    });
  }

  if (spent.greaterThanOrEqualTo(thresholdAmount) && spent.lessThan(budget.limitAmount)) {
    const title = `Budget alert: ${budget.category.name}`;
    const body = `You have reached ${budget.alertThresholdPct}% of your ${budget.category.name} budget for ${monthKey}.`;

    await prisma.notification.upsert({
      where: {
        userId_dedupeKey: {
          userId: impact.userId,
          dedupeKey: nearKey,
        },
      },
      update: {
        title,
        body,
        payload: {
          budgetId: budget.id,
          categoryId: budget.categoryId,
          month: monthKey,
          spent: spent.toFixed(2),
          limitAmount: budget.limitAmount.toFixed(2),
          thresholdPct: budget.alertThresholdPct,
          level: "near",
        },
      },
      create: {
        userId: impact.userId,
        type: "BUDGET_NEAR",
        title,
        body,
        payload: {
          budgetId: budget.id,
          categoryId: budget.categoryId,
          month: monthKey,
          spent: spent.toFixed(2),
          limitAmount: budget.limitAmount.toFixed(2),
          thresholdPct: budget.alertThresholdPct,
          level: "near",
        },
        dedupeKey: nearKey,
      },
    });
  } else {
    await prisma.notification.updateMany({
      where: {
        userId: impact.userId,
        dedupeKey: nearKey,
      },
      data: {
        dedupeKey: null,
      },
    });
  }
}

export async function processBudgetAlertsForImpacts(impacts: BudgetImpact[]): Promise<void> {
  for (const impact of impacts) {
    await syncSingleBudgetAlert(impact);
  }
}

export function registerBudgetAlertHandler(): void {
  if (handlerRegistered) {
    return;
  }

  handlerRegistered = true;

  domainEventBus.on("transaction.created", (payload) => {
    void processBudgetAlertsForImpacts(computeImpactsFromCreated(payload));
  });

  domainEventBus.on("transaction.updated", (payload) => {
    void processBudgetAlertsForImpacts(computeImpactsFromUpdated(payload));
  });

  domainEventBus.on("transaction.deleted", (payload) => {
    void processBudgetAlertsForImpacts(computeImpactsFromDeleted(payload));
  });

  domainEventBus.on("transaction.restored", (payload) => {
    void processBudgetAlertsForImpacts(computeImpactsFromRestored(payload));
  });
}
