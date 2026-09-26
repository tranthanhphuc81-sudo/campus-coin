import { Prisma, RecurringFrequency, TransactionType, type RecurringRule } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { computeNextRunDate, runRecurringMaterialization } from "./recurring.js";

type StoredTransaction = {
  id: string;
  userId: string;
  categoryId: number;
  type: TransactionType;
  amount: Prisma.Decimal;
  description: string | null;
  txnDate: Date;
  source: "RECURRING";
  recurringRuleId: number;
  recurringPeriod: string;
};

type RecurringRuleStore = RecurringRule & {
  amount: Prisma.Decimal;
};

class FakeRecurringPrisma {
  public readonly recurringRules: RecurringRuleStore[];
  public readonly transactions: StoredTransaction[] = [];

  constructor(rules: RecurringRuleStore[]) {
    this.recurringRules = rules;
  }

  recurringRule = {
    findMany: async (args: {
      where: { isActive: boolean; nextRunDate: { lte: Date } };
      orderBy: Array<{ nextRunDate: "asc" | "desc" } | { id: "asc" | "desc" }>;
    }) => {
      void args.orderBy;
      return this.recurringRules
        .filter(
          (rule) => rule.isActive === args.where.isActive && rule.nextRunDate <= args.where.nextRunDate.lte,
        )
        .sort((a, b) => a.nextRunDate.getTime() - b.nextRunDate.getTime() || a.id - b.id);
    },
    update: async (args: { where: { id: number }; data: { nextRunDate: Date; isActive: boolean } }) => {
      const target = this.recurringRules.find((rule) => rule.id === args.where.id);
      if (!target) {
        throw new Error("Rule not found.");
      }
      target.nextRunDate = args.data.nextRunDate;
      target.isActive = args.data.isActive;
      return target;
    },
  };

  transaction = {
    create: async (args: {
      data: {
        id: string;
        userId: string;
        categoryId: number;
        type: TransactionType;
        amount: Prisma.Decimal;
        description: string | null;
        txnDate: Date;
        source: "RECURRING";
        recurringRuleId: number;
        recurringPeriod: string;
      };
    }) => {
      const exists = this.transactions.some(
        (transaction) =>
          transaction.recurringRuleId === args.data.recurringRuleId &&
          transaction.recurringPeriod === args.data.recurringPeriod,
      );

      if (exists) {
        throw new Prisma.PrismaClientKnownRequestError("Duplicate recurring period", {
          code: "P2002",
          clientVersion: "test",
        });
      }

      const created: StoredTransaction = {
        ...args.data,
      };

      this.transactions.push(created);
      return created;
    },
  };
}

function createRule(overrides: Partial<RecurringRuleStore>): RecurringRuleStore {
  return {
    id: 1,
    userId: "user-1",
    categoryId: 1,
    type: "EXPENSE",
    amount: new Prisma.Decimal("9.99"),
    description: "Recurring test",
    frequency: RecurringFrequency.MONTHLY,
    intervalCount: 1,
    dayOfMonth: 15,
    dayOfWeek: null,
    startDate: new Date("2026-01-15T00:00:00.000Z"),
    endDate: null,
    nextRunDate: new Date("2026-09-15T00:00:00.000Z"),
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("computeNextRunDate", () => {
  it("handles day 31 to February in non-leap year", () => {
    const next = computeNextRunDate(
      {
        frequency: RecurringFrequency.MONTHLY,
        intervalCount: 1,
        dayOfMonth: 31,
        dayOfWeek: null,
        startDate: new Date("2025-01-31T00:00:00.000Z"),
      },
      new Date("2025-01-31T00:00:00.000Z"),
    );

    expect(next.toISOString().slice(0, 10)).toBe("2025-02-28");
  });

  it("handles day 31 to February in leap year", () => {
    const next = computeNextRunDate(
      {
        frequency: RecurringFrequency.MONTHLY,
        intervalCount: 1,
        dayOfMonth: 31,
        dayOfWeek: null,
        startDate: new Date("2024-01-31T00:00:00.000Z"),
      },
      new Date("2024-01-31T00:00:00.000Z"),
    );

    expect(next.toISOString().slice(0, 10)).toBe("2024-02-29");
  });

  it("supports weekly interval of 2", () => {
    const next = computeNextRunDate(
      {
        frequency: RecurringFrequency.WEEKLY,
        intervalCount: 2,
        dayOfMonth: null,
        dayOfWeek: 2,
        startDate: new Date("2026-09-01T00:00:00.000Z"),
      },
      new Date("2026-09-01T00:00:00.000Z"),
    );

    expect(next.toISOString().slice(0, 10)).toBe("2026-09-15");
  });
});

describe("runRecurringMaterialization", () => {
  it("does not create duplicates when running twice on the same day", async () => {
    const fakePrisma = new FakeRecurringPrisma([
      createRule({
        id: 101,
        nextRunDate: new Date("2026-09-15T00:00:00.000Z"),
      }),
    ]);

    const emittedEvents: string[] = [];
    const eventBus = {
      emit: (_eventName: "transaction.created", payload: { recurringPeriod?: string; transactionId: string }) => {
        emittedEvents.push(payload.transactionId);
      },
    };

    await runRecurringMaterialization({
      now: new Date("2026-09-15T08:00:00.000Z"),
      prismaClient: fakePrisma,
      eventBus,
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    });

    await runRecurringMaterialization({
      now: new Date("2026-09-15T10:00:00.000Z"),
      prismaClient: fakePrisma,
      eventBus,
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    });

    expect(fakePrisma.transactions).toHaveLength(1);
    expect(emittedEvents).toHaveLength(1);
  });

  it("catches up three missed monthly periods", async () => {
    const fakePrisma = new FakeRecurringPrisma([
      createRule({
        id: 202,
        nextRunDate: new Date("2026-07-20T00:00:00.000Z"),
        dayOfMonth: 20,
      }),
    ]);

    const result = await runRecurringMaterialization({
      now: new Date("2026-09-25T12:00:00.000Z"),
      prismaClient: fakePrisma,
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    });

    expect(result.createdTransactions).toBe(3);
    expect(fakePrisma.transactions.map((item) => item.recurringPeriod)).toEqual([
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
  });
});
