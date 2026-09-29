/**
 * privacy.export.ts
 * Builds the full personal-data export for `GET /me/export` (docs/spec/09 §9.14: "xuất toàn bộ dữ
 * liệu (JSON + CSV giao dịch)"). Every section is built through an existing, already-audited DTO
 * mapper (`toUserDto`, `toCategoryDto`, `toTransactionDto`, `toRecurringRuleDto`) so a secret/hash
 * column can never leak here just because a new one is added to a Prisma model later; sections with
 * no exported mapper (budgets, AI rules, insights, tips, bookmarks, import batches) use an explicit
 * field whitelist instead of spreading the raw row. BigInt primary keys (`UserTip.id`) are converted
 * to strings — `JSON.stringify` cannot serialise a `bigint`.
 * Main exports: ExportDocument, buildJsonExport, buildTransactionsCsv, streamCsvZip
 * Spec: docs/spec/09 §9.14 (data portability) · docs/spec/09 §9.10 (CSV formula-injection safety)
 */
import { ZipArchive } from 'archiver';
import type { Response } from 'express';
import { fromDbDate } from '../../lib/dates.js';
import { toCsv } from '../../lib/csvSafe.js';
import { toMoneyString } from '../../lib/money.js';
import { toCategoryDto } from '../categories/categories.mapper.js';
import { toRecurringRuleDto } from '../recurring/recurring.mapper.js';
import { toTransactionDto } from '../transactions/transactions.mapper.js';
import { toUserDto } from '../users/users.mapper.js';
import { usersRepository } from '../users/users.repository.js';
import { notFound } from '../../lib/problem.js';
import { privacyRepository } from './privacy.repository.js';

/** Full JSON export document shape returned by `GET /me/export?format=json`. */
export interface ExportDocument {
  exportedAt: string;
  user: ReturnType<typeof toUserDto>;
  categories: ReturnType<typeof toCategoryDto>[];
  /** INCLUDES soft-deleted transactions (`deletedAt` is non-null for those) — a full data dump. */
  transactions: ReturnType<typeof toTransactionDto>[];
  budgets: {
    id: number;
    categoryId: number;
    categoryName: string;
    month: string;
    limitAmount: string;
    alertThresholdPct: number;
    createdAt: string;
    updatedAt: string;
  }[];
  recurringRules: ReturnType<typeof toRecurringRuleDto>[];
  aiCategoryRules: {
    merchantKey: string;
    categoryId: number;
    hitCount: number;
    lastUsedAt: string;
    createdAt: string;
  }[];
  insights: {
    id: number;
    month: string;
    summaryText: string | null;
    tipText: string | null;
    generator: string;
    status: string;
    regenerateCount: number;
    generatedAt: string | null;
    createdAt: string;
  }[];
  userTips: {
    id: string;
    templateId: number;
    categoryId: number | null;
    period: string;
    renderedTitle: string;
    renderedBody: string;
    impactAmount: string;
    status: string;
    createdAt: string;
  }[];
  bookmarks: {
    id: number;
    targetType: string;
    targetRef: string;
    note: string | null;
    createdAt: string;
  }[];
  importBatches: {
    id: string;
    originalFilename: string;
    status: string;
    totalRows: number;
    validRows: number;
    committedRows: number;
    committedAt: string | null;
    createdAt: string;
  }[];
}

/**
 * Builds the complete JSON export for `userId`. Every field is explicitly selected (never a raw
 * Prisma row spread) — see the file header for why.
 * @throws {AppError} 404 when the account no longer exists (deleted between token issuance and this call).
 */
export async function buildJsonExport(userId: string): Promise<ExportDocument> {
  const user = await usersRepository.findById(userId);
  if (!user) throw notFound('Account not found.');

  const [categories, transactions, budgets, recurringRules, aiCategoryRules, insights, userTips, bookmarks, importBatches] = await Promise.all([
    privacyRepository.categories(userId),
    privacyRepository.transactions(userId),
    privacyRepository.budgets(userId),
    privacyRepository.recurringRules(userId),
    privacyRepository.aiCategoryRules(userId),
    privacyRepository.insights(userId),
    privacyRepository.userTips(userId),
    privacyRepository.bookmarks(userId),
    privacyRepository.importBatches(userId),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    user: toUserDto(user),
    categories: categories.map(toCategoryDto),
    transactions: transactions.map(toTransactionDto),
    budgets: budgets.map((b) => ({
      id: b.id,
      categoryId: b.categoryId,
      categoryName: b.category.name,
      month: fromDbDate(b.month),
      limitAmount: toMoneyString(b.limitAmount),
      alertThresholdPct: b.alertThresholdPct,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
    })),
    recurringRules: recurringRules.map(toRecurringRuleDto),
    aiCategoryRules: aiCategoryRules.map((r) => ({
      merchantKey: r.merchantKey,
      categoryId: r.categoryId,
      hitCount: r.hitCount,
      lastUsedAt: r.lastUsedAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    })),
    insights: insights.map((i) => ({
      id: i.id,
      month: fromDbDate(i.month),
      summaryText: i.summaryText,
      tipText: i.tipText,
      generator: i.generator,
      status: i.status,
      regenerateCount: i.regenerateCount,
      generatedAt: i.generatedAt ? i.generatedAt.toISOString() : null,
      createdAt: i.createdAt.toISOString(),
    })),
    userTips: userTips.map((t) => ({
      id: t.id.toString(),
      templateId: t.templateId,
      categoryId: t.categoryId,
      period: fromDbDate(t.period),
      renderedTitle: t.renderedTitle,
      renderedBody: t.renderedBody,
      impactAmount: toMoneyString(t.impactAmount),
      status: t.status,
      createdAt: t.createdAt.toISOString(),
    })),
    bookmarks: bookmarks.map((b) => ({
      id: b.id,
      targetType: b.targetType,
      targetRef: b.targetRef,
      note: b.note,
      createdAt: b.createdAt.toISOString(),
    })),
    importBatches: importBatches.map((b) => ({
      id: b.id,
      originalFilename: b.originalFilename,
      status: b.status,
      totalRows: b.totalRows,
      validRows: b.validRows,
      committedRows: b.committedRows,
      committedAt: b.committedAt ? b.committedAt.toISOString() : null,
      createdAt: b.createdAt.toISOString(),
    })),
  };
}

/**
 * Builds the `transactions.csv` body for `format=csv` (docs/spec/09 §9.14). Reuses `lib/csvSafe.ts`'s
 * `toCsv` — every cell is already neutralised against spreadsheet formula injection there (TC-19);
 * this function must never re-implement that escaping.
 * @param transactions - Already-mapped {@link ExportDocument.transactions} (never raw Prisma rows).
 */
export function buildTransactionsCsv(transactions: ExportDocument['transactions']): string {
  const header = ['date', 'type', 'amount', 'currency', 'category', 'description', 'source', 'createdAt', 'deletedAt'];
  const rows = transactions.map((t) => [
    t.txnDate,
    t.type,
    t.amount,
    t.currency,
    t.category.name,
    t.description,
    t.source,
    t.createdAt,
    t.deletedAt,
  ]);
  return toCsv(header, rows);
}

/**
 * Streams a `transactions.csv`-only ZIP archive to `res` (docs/spec/09 §9.14's "CSV giao dịch").
 * Caller must have already set `Content-Type`/`Content-Disposition` before calling this — `archiver`
 * pipes directly to the response stream, it does not buffer the whole archive in memory.
 * @param res - Express response to pipe the ZIP into.
 * @param csv - Output of {@link buildTransactionsCsv}.
 */
export function streamCsvZip(res: Response, csv: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on('error', reject);
    archive.on('end', resolve);
    archive.pipe(res);
    archive.append(csv, { name: 'transactions.csv' });
    void archive.finalize();
  });
}
