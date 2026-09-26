import {
  CategoryType,
  ImportBatchStatus,
  Prisma,
  TransactionSource,
  TransactionType,
  type ImportRow,
} from "@prisma/client";

import { prisma } from "../../lib/prisma.js";

export async function listImportCategories(userId: string) {
  return prisma.category.findMany({
    where: {
      isActive: true,
      OR: [{ isDefault: true }, { userId }],
    },
    select: {
      id: true,
      name: true,
      type: true,
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function createImportBatchWithRows(params: {
  id: string;
  userId: string;
  originalFilename: string;
  fileSha256: string;
  totalRows: number;
  validRows: number;
  rows: Array<{
    rowNumber: number;
    dateRaw: string | null;
    amountRaw: string | null;
    typeRaw: string | null;
    description: string | null;
    categoryRaw: string | null;
    txnDate: Date | null;
    amount: Prisma.Decimal | null;
    type: TransactionType | null;
    merchantKey: string | null;
    categoryId: number | null;
    selected: boolean;
    isDuplicate: boolean;
    errors: Prisma.InputJsonValue;
  }>;
  errorReport: Prisma.InputJsonValue;
}) {
  return prisma.importBatch.create({
    data: {
      id: params.id,
      userId: params.userId,
      originalFilename: params.originalFilename,
      fileSha256: params.fileSha256,
      status: ImportBatchStatus.PREVIEWED,
      totalRows: params.totalRows,
      validRows: params.validRows,
      errorReport: params.errorReport,
      rows: {
        createMany: {
          data: params.rows,
        },
      },
    },
  });
}

export async function getImportBatchForUser(batchId: string, userId: string) {
  return prisma.importBatch.findFirst({
    where: {
      id: batchId,
      userId,
    },
    include: {
      rows: {
        include: {
          category: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          rowNumber: "asc",
        },
      },
    },
  });
}

export async function patchImportRows(params: {
  batchId: string;
  userId: string;
  updates: Array<{ id: bigint; selected?: boolean; categoryId?: number | null }>;
}) {
  return prisma.$transaction(async (tx) => {
    const batch = await tx.importBatch.findFirst({
      where: { id: params.batchId, userId: params.userId },
      select: { id: true, status: true },
    });

    if (!batch) {
      return null;
    }

    for (const update of params.updates) {
      await tx.importRow.updateMany({
        where: {
          id: update.id,
          importBatchId: params.batchId,
          importBatch: {
            userId: params.userId,
          },
        },
        data: {
          selected: update.selected,
          categoryId: update.categoryId,
        },
      });
    }

    return batch;
  });
}

export async function deleteImportBatch(params: { batchId: string; userId: string }) {
  return prisma.importBatch.deleteMany({
    where: {
      id: params.batchId,
      userId: params.userId,
    },
  });
}

export async function listOwnedTransactionsForDuplicateCheck(params: {
  userId: string;
  from: Date;
  to: Date;
  amounts: Prisma.Decimal[];
}) {
  return prisma.transaction.findMany({
    where: {
      userId: params.userId,
      deletedAt: null,
      txnDate: {
        gte: params.from,
        lte: params.to,
      },
      amount: {
        in: params.amounts,
      },
    },
    select: {
      id: true,
      txnDate: true,
      amount: true,
      description: true,
    },
  });
}

export async function findCategoryByIdForUserAndType(params: {
  userId: string;
  categoryId: number;
  type: CategoryType;
}) {
  return prisma.category.findFirst({
    where: {
      id: params.categoryId,
      type: params.type,
      isActive: true,
      OR: [{ isDefault: true }, { userId: params.userId }],
    },
    select: {
      id: true,
      name: true,
    },
  });
}

export async function reserveImportCommitIdempotency(params: {
  userId: string;
  keyHash: string;
  expiresAt: Date;
}) {
  return prisma.idempotencyKey.create({
    data: {
      userId: params.userId,
      scope: "imports.commit",
      keyHash: params.keyHash,
      expiresAt: params.expiresAt,
    },
  });
}

export async function commitImportBatch(params: {
  batchId: string;
  userId: string;
  now: Date;
  buildTransactionId: () => string;
}): Promise<{
  insertedRows: Array<ImportRow>;
  createdTransactions: Array<{
    transactionId: string;
    categoryId: number;
    type: TransactionType;
    amount: Prisma.Decimal;
    txnDate: Date;
    description: string | null;
  }>;
  alreadyCommitted: boolean;
} | null> {
  return prisma.$transaction(async (tx) => {
    const batch = await tx.importBatch.findFirst({
      where: {
        id: params.batchId,
        userId: params.userId,
      },
      include: {
        rows: {
          where: {
            selected: true,
            type: { not: null },
            txnDate: { not: null },
            amount: { not: null },
            categoryId: { not: null },
          },
          orderBy: {
            rowNumber: "asc",
          },
        },
      },
    });

    if (!batch) {
      return null;
    }

    if (batch.status === ImportBatchStatus.COMMITTED) {
      return { insertedRows: [], createdTransactions: [], alreadyCommitted: true };
    }

    const rowsToInsert = batch.rows.filter((row) => {
      const errors = Array.isArray(row.errors) ? row.errors : [];
      return errors.length === 0;
    });

    const createdTransactions: Array<{
      transactionId: string;
      categoryId: number;
      type: TransactionType;
      amount: Prisma.Decimal;
      txnDate: Date;
      description: string | null;
    }> = [];

    for (const row of rowsToInsert) {
      const transactionId = params.buildTransactionId();
      await tx.transaction.create({
        data: {
          id: transactionId,
          userId: params.userId,
          categoryId: row.categoryId as number,
          type: row.type as TransactionType,
          amount: row.amount as Prisma.Decimal,
          description: row.description,
          txnDate: row.txnDate as Date,
          source: TransactionSource.CSV_IMPORT,
          importBatchId: batch.id,
        },
      });

      await tx.transactionHistory.create({
        data: {
          transactionId,
          userId: params.userId,
          action: "CREATE",
          snapshot: {
            source: "csv_import",
            importBatchId: batch.id,
            amount: (row.amount as Prisma.Decimal).toFixed(2),
            txnDate: (row.txnDate as Date).toISOString().slice(0, 10),
            categoryId: row.categoryId,
            description: row.description,
            type: row.type === TransactionType.INCOME ? "income" : "expense",
          },
          changedFields: Prisma.JsonNull,
          changedBy: params.userId,
          changedAt: params.now,
        },
      });

      createdTransactions.push({
        transactionId,
        categoryId: row.categoryId as number,
        type: row.type as TransactionType,
        amount: row.amount as Prisma.Decimal,
        txnDate: row.txnDate as Date,
        description: row.description,
      });
    }

    await tx.importBatch.update({
      where: { id: batch.id },
      data: {
        status: ImportBatchStatus.COMMITTED,
        committedAt: params.now,
        committedRows: rowsToInsert.length,
      },
    });

    return { insertedRows: rowsToInsert, createdTransactions, alreadyCommitted: false };
  });
}
