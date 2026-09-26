import { CategoryType, Prisma, TransactionSource, TransactionType } from "@prisma/client";
import { uuidv7 } from "uuidv7";

import { domainEventBus } from "../../events/bus.js";
import { recordRecentActivity } from "../../lib/recentActivity.js";
import { notFound, validationFailed } from "../../lib/problem.js";
import {
  createTransaction,
  findCategoryForUserAndType,
  findOwnedActiveTransactionById,
  listOwnedTransactions,
  softDeleteOwnedTransaction,
  updateOwnedTransaction,
  updateOwnedTransactionFlags,
} from "./repository.js";
import type {
  CreateTransactionInput,
  ListTransactionsQueryInput,
  ResolveTransactionFlagInput,
  TransactionDto,
  TransactionWireSource,
  TransactionWireType,
  UpdateTransactionInput,
} from "./types.js";

function parseDateOnly(input: string): Date {
  const date = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw validationFailed([
      {
        field: "txnDate",
        message: "txnDate must be a valid date.",
      },
    ]);
  }

  return date;
}

function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toIsoString(date: Date): string {
  return date.toISOString();
}

function toPrismaType(type: TransactionWireType): TransactionType {
  return type === "income" ? TransactionType.INCOME : TransactionType.EXPENSE;
}

function toPrismaCategoryType(type: TransactionWireType): CategoryType {
  return type === "income" ? CategoryType.INCOME : CategoryType.EXPENSE;
}

function toWireType(type: TransactionType): TransactionWireType {
  return type === TransactionType.INCOME ? "income" : "expense";
}

function toWireSource(source: TransactionSource): TransactionWireSource {
  if (source === TransactionSource.RECURRING) {
    return "recurring";
  }

  if (source === TransactionSource.CSV_IMPORT) {
    return "csv_import";
  }

  return "manual";
}

function formatAmount(amount: Prisma.Decimal): string {
  return amount.toFixed(2);
}

function mapTransactionToDto(transaction: {
  id: string;
  categoryId: number;
  category: { name: string };
  type: TransactionType;
  amount: Prisma.Decimal;
  description: string | null;
  source: TransactionSource;
  isAnomaly: boolean;
  isPossibleDuplicate: boolean;
  txnDate: Date;
  createdAt: Date;
  updatedAt: Date;
}): TransactionDto {
  return {
    id: transaction.id,
    categoryId: transaction.categoryId,
    categoryName: transaction.category.name,
    type: toWireType(transaction.type),
    amount: formatAmount(transaction.amount),
    description: transaction.description,
    source: toWireSource(transaction.source),
    isAnomaly: transaction.isAnomaly,
    isPossibleDuplicate: transaction.isPossibleDuplicate,
    txnDate: toDateOnlyString(transaction.txnDate),
    createdAt: toIsoString(transaction.createdAt),
    updatedAt: toIsoString(transaction.updatedAt),
  };
}

function monthRange(month: string): { gte: Date; lt: Date } {
  const [yearToken, monthToken] = month.split("-");
  const year = Number(yearToken);
  const monthIndex = Number(monthToken) - 1;

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthIndex) ||
    monthIndex < 0 ||
    monthIndex > 11
  ) {
    throw validationFailed([
      {
        field: "month",
        message: "month must use YYYY-MM format.",
      },
    ]);
  }

  const gte = new Date(Date.UTC(year, monthIndex, 1));
  const lt = new Date(Date.UTC(year, monthIndex + 1, 1));
  return { gte, lt };
}

function ensurePositiveAmount(amount: Prisma.Decimal): void {
  if (!amount.gt(0)) {
    throw validationFailed([
      {
        field: "amount",
        message: "amount must be greater than zero.",
      },
    ]);
  }
}

async function ensureCategoryOwnership(params: {
  userId: string;
  categoryId: number;
  type: TransactionWireType;
}): Promise<void> {
  const category = await findCategoryForUserAndType({
    userId: params.userId,
    categoryId: params.categoryId,
    type: toPrismaCategoryType(params.type),
  });

  if (!category) {
    throw notFound("Category was not found.");
  }
}

export async function listTransactions(
  userId: string,
  query: ListTransactionsQueryInput,
): Promise<TransactionDto[]> {
  const records = await listOwnedTransactions({
    userId,
    type: query.type ? toPrismaType(query.type) : undefined,
    categoryId: query.categoryId,
    q: query.q,
    dateRange: query.month ? monthRange(query.month) : undefined,
  });

  return records.map(mapTransactionToDto);
}

export async function addTransaction(
  userId: string,
  payload: CreateTransactionInput,
): Promise<TransactionDto> {
  await ensureCategoryOwnership({
    userId,
    categoryId: payload.categoryId,
    type: payload.type,
  });

  const amount = new Prisma.Decimal(payload.amount);
  ensurePositiveAmount(amount);

  const txnDate = parseDateOnly(payload.txnDate);

  const created = await createTransaction({
    id: uuidv7(),
    user: { connect: { id: userId } },
    category: { connect: { id: payload.categoryId } },
    type: toPrismaType(payload.type),
    amount,
    description: payload.description?.trim() || null,
    txnDate,
    source: TransactionSource.MANUAL,
  });

  const withCategory = await findOwnedActiveTransactionById({
    id: created.id,
    userId,
  });

  if (!withCategory) {
    throw notFound("Transaction was not found.");
  }

  domainEventBus.emit("transaction.created", {
    transactionId: withCategory.id,
    userId,
    categoryId: withCategory.categoryId,
    type: toWireType(withCategory.type),
    amount: formatAmount(withCategory.amount),
    txnDate: toDateOnlyString(withCategory.txnDate),
    source: toWireSource(withCategory.source),
    description: withCategory.description,
    categorySource: payload.categorySource ?? "user",
    aiSuggestedCategoryId: payload.aiSuggestedCategoryId ?? null,
    aiConfidence: payload.aiConfidence ?? null,
  });

  return mapTransactionToDto(withCategory);
}

export async function patchTransaction(
  userId: string,
  id: string,
  payload: UpdateTransactionInput,
): Promise<TransactionDto> {
  const existing = await findOwnedActiveTransactionById({ id, userId });
  if (!existing) {
    throw notFound("Transaction was not found.");
  }

  const nextType = payload.type ?? toWireType(existing.type);
  const nextCategoryId = payload.categoryId ?? existing.categoryId;

  if (payload.type !== undefined || payload.categoryId !== undefined) {
    await ensureCategoryOwnership({
      userId,
      categoryId: nextCategoryId,
      type: nextType,
    });
  }

  const amount = payload.amount === undefined ? undefined : new Prisma.Decimal(payload.amount);
  if (amount) {
    ensurePositiveAmount(amount);
  }

  await updateOwnedTransaction({
    id,
    userId,
    data: {
      category:
        payload.categoryId === undefined ? undefined : { connect: { id: payload.categoryId } },
      type: payload.type === undefined ? undefined : toPrismaType(payload.type),
      amount,
      description: payload.description,
      txnDate: payload.txnDate ? parseDateOnly(payload.txnDate) : undefined,
    },
  });

  const updated = await findOwnedActiveTransactionById({ id, userId });
  if (!updated) {
    throw notFound("Transaction was not found.");
  }

  domainEventBus.emit("transaction.updated", {
    before: {
      transactionId: existing.id,
      userId,
      categoryId: existing.categoryId,
      type: toWireType(existing.type),
      amount: formatAmount(existing.amount),
      txnDate: toDateOnlyString(existing.txnDate),
    },
    after: {
      transactionId: updated.id,
      userId,
      categoryId: updated.categoryId,
      type: toWireType(updated.type),
      amount: formatAmount(updated.amount),
      txnDate: toDateOnlyString(updated.txnDate),
    },
  });

  await recordRecentActivity({
    userId,
    transactionId: updated.id,
    activityType: "EDITED",
    categoryName: updated.category.name,
    amount: updated.amount,
    txnDate: updated.txnDate,
    description: updated.description,
  });

  return mapTransactionToDto(updated);
}

export async function removeTransaction(userId: string, id: string): Promise<{ deleted: boolean }> {
  const existing = await findOwnedActiveTransactionById({ id, userId });
  if (!existing) {
    throw notFound("Transaction was not found.");
  }

  await softDeleteOwnedTransaction({ id, userId });

  domainEventBus.emit("transaction.deleted", {
    transaction: {
      transactionId: existing.id,
      userId,
      categoryId: existing.categoryId,
      type: toWireType(existing.type),
      amount: formatAmount(existing.amount),
      txnDate: toDateOnlyString(existing.txnDate),
    },
  });

  return { deleted: true };
}

export async function resolveTransactionFlag(
  userId: string,
  id: string,
  payload: ResolveTransactionFlagInput,
): Promise<{ resolved: true; deleted?: boolean }> {
  const existing = await findOwnedActiveTransactionById({ id, userId });
  if (!existing) {
    throw notFound("Transaction was not found.");
  }

  if (payload.action === "delete") {
    await softDeleteOwnedTransaction({ id, userId });

    domainEventBus.emit("transaction.deleted", {
      transaction: {
        transactionId: existing.id,
        userId,
        categoryId: existing.categoryId,
        type: toWireType(existing.type),
        amount: formatAmount(existing.amount),
        txnDate: toDateOnlyString(existing.txnDate),
      },
    });

    return { resolved: true, deleted: true };
  }

  await updateOwnedTransactionFlags({
    id,
    userId,
    data:
      payload.flag === "anomaly"
        ? { isAnomaly: false }
        : {
            isPossibleDuplicate: false,
          },
  });

  const updated = await findOwnedActiveTransactionById({ id, userId });
  if (!updated) {
    throw notFound("Transaction was not found.");
  }

  await recordRecentActivity({
    userId,
    transactionId: updated.id,
    activityType: "EDITED",
    categoryName: updated.category.name,
    amount: updated.amount,
    txnDate: updated.txnDate,
    description: updated.description,
  });

  return { resolved: true };
}
