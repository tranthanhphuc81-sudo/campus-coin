import { Prisma, RecurringFrequency, TransactionType } from "@prisma/client";
import { uuidv7 } from "uuidv7";

import { domainEventBus } from "../events/bus.js";
import { prisma } from "../lib/prisma.js";

const JOB_TIMEZONE = "Asia/Ho_Chi_Minh";
const MAX_CATCH_UP_PERIODS = 12;

type RecurringRuleForSchedule = {
  frequency: RecurringFrequency;
  intervalCount: number;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  startDate: Date;
};

type Logger = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

type RecurringRuleRecord = {
  id: number;
  userId: string;
  categoryId: number;
  type: TransactionType;
  amount: Prisma.Decimal;
  description: string | null;
  frequency: RecurringFrequency;
  intervalCount: number;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  startDate: Date;
  endDate: Date | null;
  nextRunDate: Date;
  isActive: boolean;
};

type MinimalRecurringPrismaClient = {
  recurringRule: {
    findMany: (args: {
      where: {
        isActive: boolean;
        nextRunDate: { lte: Date };
      };
      orderBy: Array<{ nextRunDate: "asc" | "desc" } | { id: "asc" | "desc" }>;
    }) => Promise<RecurringRuleRecord[]>;
    update: (args: {
      where: { id: number };
      data: { nextRunDate: Date; isActive: boolean };
    }) => Promise<RecurringRuleRecord>;
  };
  transaction: {
    create: (args: {
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
    }) => Promise<{
      id: string;
      userId: string;
      categoryId: number;
      amount: Prisma.Decimal;
      txnDate: Date;
    }>;
  };
};

type TransactionCreatedPublisher = {
  emit: (eventName: "transaction.created", payload: {
    transactionId: string;
    userId: string;
    categoryId: number;
    amount: string;
    txnDate: string;
    source: "recurring";
  }) => void;
};

const defaultLogger: Logger = {
  info: (message) => {
    process.stdout.write(`${message}\n`);
  },
  warn: (message) => {
    process.stdout.write(`${message}\n`);
  },
  error: (message) => {
    process.stderr.write(`${message}\n`);
  },
};

function toDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, amount: number): Date {
  const next = toDateOnly(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function clampDayOfMonth(year: number, monthIndex: number, preferredDay: number): number {
  return Math.min(preferredDay, daysInMonth(year, monthIndex));
}

function startOfIsoWeek(date: Date): Date {
  const normalized = toDateOnly(date);
  const isoDay = ((normalized.getUTCDay() + 6) % 7) + 1;
  return addDays(normalized, 1 - isoDay);
}

function toIsoDay(dayOfWeek: number | null, fallbackDate: Date): number {
  if (dayOfWeek && dayOfWeek >= 1 && dayOfWeek <= 7) {
    return dayOfWeek;
  }

  return ((fallbackDate.getUTCDay() + 6) % 7) + 1;
}

function getIsoWeek(date: Date): { weekYear: number; weekNumber: number } {
  const normalized = toDateOnly(date);
  const dayNumber = ((normalized.getUTCDay() + 6) % 7) + 1;
  const thursday = addDays(normalized, 4 - dayNumber);
  const weekYear = thursday.getUTCFullYear();
  const januaryFourth = new Date(Date.UTC(weekYear, 0, 4));
  const firstWeekMonday = startOfIsoWeek(januaryFourth);
  const weekNumber = Math.floor((thursday.getTime() - firstWeekMonday.getTime()) / 86400000 / 7) + 1;

  return { weekYear, weekNumber };
}

function formatDateOnly(date: Date): string {
  return toDateOnly(date).toISOString().slice(0, 10);
}

function formatRecurringPeriod(frequency: RecurringFrequency, dueDate: Date): string {
  const normalized = toDateOnly(dueDate);
  const year = normalized.getUTCFullYear();

  if (frequency === RecurringFrequency.MONTHLY) {
    const month = String(normalized.getUTCMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  if (frequency === RecurringFrequency.WEEKLY) {
    const isoWeek = getIsoWeek(normalized);
    return `${isoWeek.weekYear}-W${String(isoWeek.weekNumber).padStart(2, "0")}`;
  }

  return String(year);
}

export function computeNextRunDate(rule: RecurringRuleForSchedule, fromDate: Date): Date {
  const interval = Math.max(1, Math.trunc(rule.intervalCount));
  const baseDate = toDateOnly(fromDate);

  if (rule.frequency === RecurringFrequency.WEEKLY) {
    const moved = addDays(baseDate, interval * 7);
    const monday = startOfIsoWeek(moved);
    const isoDay = toIsoDay(rule.dayOfWeek, moved);
    return addDays(monday, isoDay - 1);
  }

  if (rule.frequency === RecurringFrequency.MONTHLY) {
    const targetMonthIndex = baseDate.getUTCMonth() + interval;
    const targetYear = baseDate.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
    const monthIndex = ((targetMonthIndex % 12) + 12) % 12;
    const preferredDay = rule.dayOfMonth ?? baseDate.getUTCDate();
    const day = clampDayOfMonth(targetYear, monthIndex, preferredDay);
    return new Date(Date.UTC(targetYear, monthIndex, day));
  }

  const targetYear = baseDate.getUTCFullYear() + interval;
  const targetMonth = rule.startDate.getUTCMonth();
  const preferredDay = rule.dayOfMonth ?? rule.startDate.getUTCDate();
  const day = clampDayOfMonth(targetYear, targetMonth, preferredDay);
  return new Date(Date.UTC(targetYear, targetMonth, day));
}

export function computeInitialNextRunDate(rule: RecurringRuleForSchedule): Date {
  const baseDate = toDateOnly(rule.startDate);

  if (rule.frequency === RecurringFrequency.WEEKLY) {
    const monday = startOfIsoWeek(baseDate);
    const isoDay = toIsoDay(rule.dayOfWeek, baseDate);
    const candidate = addDays(monday, isoDay - 1);
    return candidate < baseDate ? addDays(candidate, Math.max(1, rule.intervalCount) * 7) : candidate;
  }

  if (rule.frequency === RecurringFrequency.MONTHLY) {
    const preferredDay = rule.dayOfMonth ?? baseDate.getUTCDate();
    const day = clampDayOfMonth(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), preferredDay);
    const candidate = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), day));
    return candidate < baseDate ? computeNextRunDate(rule, candidate) : candidate;
  }

  const preferredDay = rule.dayOfMonth ?? baseDate.getUTCDate();
  const day = clampDayOfMonth(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), preferredDay);
  const candidate = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), day));
  return candidate < baseDate ? computeNextRunDate(rule, candidate) : candidate;
}

function getTodayInTimezone(timezone: string): Date {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "1");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "1");
  return new Date(Date.UTC(year, month - 1, day));
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function runRecurringMaterialization(options?: {
  now?: Date;
  logger?: Logger;
  prismaClient?: MinimalRecurringPrismaClient;
  eventBus?: TransactionCreatedPublisher;
}): Promise<{ processedRules: number; createdTransactions: number; skippedDuplicates: number }> {
  const logger = options?.logger ?? defaultLogger;
  const prismaClient = options?.prismaClient ?? prisma;
  const eventBus = options?.eventBus ?? domainEventBus;
  const today = options?.now ? toDateOnly(options.now) : getTodayInTimezone(JOB_TIMEZONE);

  const dueRules = await prismaClient.recurringRule.findMany({
    where: {
      isActive: true,
      nextRunDate: {
        lte: today,
      },
    },
    orderBy: [{ nextRunDate: "asc" }, { id: "asc" }],
  });

  let createdTransactions = 0;
  let skippedDuplicates = 0;

  for (const rule of dueRules) {
    let nextRunDate = toDateOnly(rule.nextRunDate);
    let stillActive = rule.isActive;
    let generatedPeriods = 0;

    while (stillActive && nextRunDate <= today && generatedPeriods < MAX_CATCH_UP_PERIODS) {
      if (rule.endDate && nextRunDate > toDateOnly(rule.endDate)) {
        stillActive = false;
        break;
      }

      const recurringPeriod = formatRecurringPeriod(rule.frequency, nextRunDate);

      try {
        const transaction = await prismaClient.transaction.create({
          data: {
            id: uuidv7(),
            userId: rule.userId,
            categoryId: rule.categoryId,
            type: rule.type,
            amount: rule.amount,
            description: rule.description,
            txnDate: nextRunDate,
            source: "RECURRING",
            recurringRuleId: rule.id,
            recurringPeriod,
          },
        });

        createdTransactions += 1;
        eventBus.emit("transaction.created", {
          transactionId: transaction.id,
          userId: transaction.userId,
          categoryId: transaction.categoryId,
          amount: transaction.amount.toString(),
          txnDate: formatDateOnly(transaction.txnDate),
          source: "recurring",
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          skippedDuplicates += 1;
        } else {
          logger.error(
            `[recurring.materialize] Failed for rule ${rule.id} at ${formatDateOnly(nextRunDate)}: ${String(error)}`,
          );
          break;
        }
      }

      nextRunDate = computeNextRunDate(rule, nextRunDate);
      generatedPeriods += 1;

      if (rule.endDate && nextRunDate > toDateOnly(rule.endDate)) {
        stillActive = false;
      }
    }

    if (generatedPeriods >= MAX_CATCH_UP_PERIODS && nextRunDate <= today) {
      logger.warn(
        `[recurring.materialize] Rule ${rule.id} reached catch-up limit (${MAX_CATCH_UP_PERIODS}) and will continue tomorrow.`,
      );
    }

    await prismaClient.recurringRule.update({
      where: { id: rule.id },
      data: {
        nextRunDate,
        isActive: stillActive,
      },
    });
  }

  logger.info(
    `[recurring.materialize] processedRules=${dueRules.length} createdTransactions=${createdTransactions} skippedDuplicates=${skippedDuplicates}`,
  );

  return {
    processedRules: dueRules.length,
    createdTransactions,
    skippedDuplicates,
  };
}

export function toRecurringType(type: "income" | "expense"): TransactionType {
  return type === "income" ? "INCOME" : "EXPENSE";
}

export function toRecurringFrequency(frequency: "weekly" | "monthly" | "yearly"): RecurringFrequency {
  if (frequency === "weekly") {
    return "WEEKLY";
  }

  if (frequency === "monthly") {
    return "MONTHLY";
  }

  return "YEARLY";
}
