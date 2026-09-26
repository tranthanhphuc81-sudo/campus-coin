import type { RecurringRule } from "@prisma/client";
import { Prisma } from "@prisma/client";

import {
  computeInitialNextRunDate,
  toRecurringFrequency,
  toRecurringType,
} from "../../jobs/recurring.js";
import { notFound, validationFailed } from "../../lib/problem.js";
import {
  createRecurringRule,
  findCategoryForRule,
  findRecurringRuleById,
  listRecurringRulesByUser,
  updateRecurringRule,
} from "./repository.js";
import type {
  CreateRecurringRuleInput,
  RecurringRuleDto,
  RecurringFrequencyWire,
  RecurringTypeWire,
  UpdateRecurringRuleInput,
} from "./types.js";

function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toUtcDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function parseDateOnly(input: string): Date {
  const date = new Date(`${input}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw validationFailed([
      {
        field: "date",
        message: "Invalid date format.",
      },
    ]);
  }

  return date;
}

function toTypeWire(type: "INCOME" | "EXPENSE"): RecurringTypeWire {
  return type === "INCOME" ? "income" : "expense";
}

function toFrequencyWire(frequency: "WEEKLY" | "MONTHLY" | "YEARLY"): RecurringFrequencyWire {
  if (frequency === "WEEKLY") {
    return "weekly";
  }

  if (frequency === "MONTHLY") {
    return "monthly";
  }

  return "yearly";
}

function toDto(rule: RecurringRule): RecurringRuleDto {
  return {
    id: rule.id,
    categoryId: rule.categoryId,
    type: toTypeWire(rule.type),
    amount: rule.amount.toString(),
    description: rule.description,
    frequency: toFrequencyWire(rule.frequency),
    intervalCount: rule.intervalCount,
    dayOfMonth: rule.dayOfMonth,
    dayOfWeek: rule.dayOfWeek,
    startDate: toDateOnlyString(rule.startDate),
    endDate: rule.endDate ? toDateOnlyString(rule.endDate) : null,
    nextRunDate: toDateOnlyString(rule.nextRunDate),
    isActive: rule.isActive,
  };
}

async function ensureCategoryOwnership(params: {
  userId: string;
  categoryId: number;
  type: "INCOME" | "EXPENSE";
}) {
  const category = await findCategoryForRule(params);
  if (!category) {
    throw notFound("Category was not found.");
  }
}

export async function listRecurringRules(userId: string): Promise<RecurringRuleDto[]> {
  const rules = await listRecurringRulesByUser(userId);
  return rules.map(toDto);
}

export async function addRecurringRule(
  userId: string,
  payload: CreateRecurringRuleInput,
): Promise<RecurringRuleDto> {
  const type = toRecurringType(payload.type);

  await ensureCategoryOwnership({
    userId,
    categoryId: payload.categoryId,
    type,
  });

  const startDate = parseDateOnly(payload.startDate);
  const endDate = payload.endDate ? parseDateOnly(payload.endDate) : null;
  const intervalCount = payload.intervalCount ?? 1;

  const scheduleDraft = {
    frequency: toRecurringFrequency(payload.frequency),
    intervalCount,
    dayOfMonth: payload.dayOfMonth ?? null,
    dayOfWeek: payload.dayOfWeek ?? null,
    startDate,
  };

  const nextRunDate = computeInitialNextRunDate(scheduleDraft);

  const created = await createRecurringRule({
    user: { connect: { id: userId } },
    category: { connect: { id: payload.categoryId } },
    type,
    amount: new Prisma.Decimal(payload.amount),
    description: payload.description,
    frequency: scheduleDraft.frequency,
    intervalCount,
    dayOfMonth: scheduleDraft.dayOfMonth,
    dayOfWeek: scheduleDraft.dayOfWeek,
    startDate,
    endDate,
    nextRunDate,
    isActive: true,
  });

  return toDto(created);
}

export async function patchRecurringRule(
  userId: string,
  id: number,
  payload: UpdateRecurringRuleInput,
): Promise<RecurringRuleDto> {
  const existing = await findRecurringRuleById({ id, userId });
  if (!existing) {
    throw notFound("Recurring rule was not found.");
  }

  if (payload.categoryId !== undefined) {
    await ensureCategoryOwnership({
      userId,
      categoryId: payload.categoryId,
      type: existing.type,
    });
  }

  const nextFrequency = existing.frequency;
  const nextIntervalCount = payload.intervalCount ?? existing.intervalCount;
  const nextDayOfMonth = payload.dayOfMonth === undefined ? existing.dayOfMonth : payload.dayOfMonth;
  const nextDayOfWeek = payload.dayOfWeek === undefined ? existing.dayOfWeek : payload.dayOfWeek;

  const shouldRecalculateNextRunDate =
    payload.intervalCount !== undefined ||
    payload.dayOfMonth !== undefined ||
    payload.dayOfWeek !== undefined ||
    payload.isActive === true;

  let recalculatedNextRunDate: Date | undefined;
  if (shouldRecalculateNextRunDate) {
    const today = toUtcDateOnly(new Date());
    const anchor = toUtcDateOnly(existing.nextRunDate) < today ? today : toUtcDateOnly(existing.nextRunDate);
    recalculatedNextRunDate = computeInitialNextRunDate({
      frequency: nextFrequency,
      intervalCount: nextIntervalCount,
      dayOfMonth: nextDayOfMonth,
      dayOfWeek: nextDayOfWeek,
      startDate: anchor,
    });
  }

  const data: Prisma.RecurringRuleUpdateInput = {
    category: payload.categoryId === undefined ? undefined : { connect: { id: payload.categoryId } },
    amount: payload.amount === undefined ? undefined : new Prisma.Decimal(payload.amount),
    description: payload.description,
    intervalCount: payload.intervalCount,
    dayOfMonth: payload.dayOfMonth === undefined ? undefined : payload.dayOfMonth,
    dayOfWeek: payload.dayOfWeek === undefined ? undefined : payload.dayOfWeek,
    endDate: payload.endDate === undefined ? undefined : payload.endDate ? parseDateOnly(payload.endDate) : null,
    isActive: payload.isActive,
    nextRunDate: recalculatedNextRunDate,
  };

  await updateRecurringRule({ id, userId, data });

  const updated = await findRecurringRuleById({ id, userId });
  if (!updated) {
    throw notFound("Recurring rule was not found.");
  }

  return toDto(updated);
}

export async function disableRecurringRule(userId: string, id: number): Promise<{ deleted: boolean }> {
  const existing = await findRecurringRuleById({ id, userId });
  if (!existing) {
    throw notFound("Recurring rule was not found.");
  }

  await updateRecurringRule({
    id,
    userId,
    data: {
      isActive: false,
    },
  });

  return { deleted: true };
}
