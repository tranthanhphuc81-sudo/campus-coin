import { TransactionSource, TransactionType } from "@prisma/client";

import { domainEventBus } from "../bus.js";
import { prisma } from "../../lib/prisma.js";
import { levenshtein, mean, median, stddev } from "../../lib/stats.js";

const ANOMALY_NOTIFICATION_TITLE = "Unusually large expense - is this correct?";

let handlerRegistered = false;

function addDays(date: Date, delta: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + delta));
}

function normalizeMerchantKey(description: string | null): string {
  if (!description) {
    return "";
  }

  return description
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|at|from|by|and)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

async function evaluateAnomaly(transactionId: string): Promise<void> {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: {
      id: true,
      userId: true,
      categoryId: true,
      type: true,
      amount: true,
      txnDate: true,
      deletedAt: true,
    },
  });

  if (!transaction || transaction.deletedAt || transaction.type !== TransactionType.EXPENSE) {
    return;
  }

  const windowStart = addDays(transaction.txnDate, -90);
  const categoryRows = await prisma.transaction.findMany({
    where: {
      userId: transaction.userId,
      categoryId: transaction.categoryId,
      type: TransactionType.EXPENSE,
      deletedAt: null,
      txnDate: {
        gte: windowStart,
        lte: transaction.txnDate,
      },
    },
    select: {
      amount: true,
    },
  });

  if (categoryRows.length < 5) {
    await prisma.transaction.updateMany({
      where: { id: transaction.id, deletedAt: null },
      data: { isAnomaly: false },
    });
    return;
  }

  const values = categoryRows.map((row) => Number(row.amount.toString()));
  const currentAmount = Number(transaction.amount.toString());

  const avg = mean(values);
  const sigma = stddev(values);
  const med = median(values);

  // Monthly allowance baseline is not yet modeled in the current schema.
  const baselineThreshold = 0;
  const isAnomaly =
    (currentAmount > avg + sigma * 3 || currentAmount > med * 3) &&
    currentAmount > baselineThreshold;

  await prisma.transaction.updateMany({
    where: { id: transaction.id, deletedAt: null },
    data: { isAnomaly },
  });

  if (!isAnomaly) {
    return;
  }

  const dedupeKey = `anomaly:${transaction.id}`;
  await prisma.notification.upsert({
    where: {
      userId_dedupeKey: {
        userId: transaction.userId,
        dedupeKey,
      },
    },
    update: {
      type: "ANOMALY",
      title: ANOMALY_NOTIFICATION_TITLE,
      body: "A transaction was flagged as unusual for this category.",
      payload: {
        transactionId: transaction.id,
        categoryId: transaction.categoryId,
      },
    },
    create: {
      userId: transaction.userId,
      type: "ANOMALY",
      title: ANOMALY_NOTIFICATION_TITLE,
      body: "A transaction was flagged as unusual for this category.",
      payload: {
        transactionId: transaction.id,
        categoryId: transaction.categoryId,
      },
      dedupeKey,
    },
  });
}

async function evaluateDuplicate(transactionId: string): Promise<void> {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: {
      id: true,
      userId: true,
      categoryId: true,
      type: true,
      amount: true,
      description: true,
      source: true,
      txnDate: true,
      createdAt: true,
      deletedAt: true,
    },
  });

  if (!transaction || transaction.deletedAt || transaction.source === TransactionSource.RECURRING) {
    return;
  }

  const dateStart = addDays(transaction.txnDate, -1);
  const dateEnd = addDays(transaction.txnDate, 1);
  const createdStart = new Date(transaction.createdAt.getTime() - 10 * 60 * 1000);
  const createdEnd = new Date(transaction.createdAt.getTime() + 10 * 60 * 1000);

  const candidates = await prisma.transaction.findMany({
    where: {
      id: { not: transaction.id },
      userId: transaction.userId,
      type: transaction.type,
      amount: transaction.amount,
      source: {
        not: TransactionSource.RECURRING,
      },
      deletedAt: null,
      txnDate: {
        gte: dateStart,
        lte: dateEnd,
      },
      createdAt: {
        gte: createdStart,
        lte: createdEnd,
      },
    },
    select: {
      id: true,
      categoryId: true,
      description: true,
    },
    take: 20,
  });

  const merchantKey = normalizeMerchantKey(transaction.description);
  const duplicateCandidate = candidates.find((candidate) => {
    if (candidate.categoryId === transaction.categoryId) {
      return true;
    }

    const candidateKey = normalizeMerchantKey(candidate.description);
    if (!merchantKey || !candidateKey) {
      return false;
    }

    return levenshtein(merchantKey, candidateKey) <= 2;
  });

  const isPossibleDuplicate = Boolean(duplicateCandidate);

  await prisma.transaction.updateMany({
    where: { id: transaction.id, deletedAt: null },
    data: { isPossibleDuplicate },
  });

  if (!isPossibleDuplicate) {
    return;
  }

  const dedupeKey = `duplicate:${transaction.id}`;
  await prisma.notification.upsert({
    where: {
      userId_dedupeKey: {
        userId: transaction.userId,
        dedupeKey,
      },
    },
    update: {
      type: "DUPLICATE",
      title: "Possible duplicate transaction",
      body: "This transaction looks like a duplicate. Keep it or delete it.",
      payload: {
        transactionId: transaction.id,
        duplicateWithId: duplicateCandidate?.id ?? null,
      },
    },
    create: {
      userId: transaction.userId,
      type: "DUPLICATE",
      title: "Possible duplicate transaction",
      body: "This transaction looks like a duplicate. Keep it or delete it.",
      payload: {
        transactionId: transaction.id,
        duplicateWithId: duplicateCandidate?.id ?? null,
      },
      dedupeKey,
    },
  });
}

async function evaluateFlags(transactionId: string): Promise<void> {
  await evaluateAnomaly(transactionId);
  await evaluateDuplicate(transactionId);
}

export function registerAnomalyHandler(): void {
  if (handlerRegistered) {
    return;
  }

  handlerRegistered = true;

  domainEventBus.on("transaction.created", (payload) => {
    void evaluateFlags(payload.transactionId).catch(() => undefined);
  });

  domainEventBus.on("transaction.updated", (payload) => {
    void evaluateFlags(payload.after.transactionId).catch(() => undefined);
  });
}
