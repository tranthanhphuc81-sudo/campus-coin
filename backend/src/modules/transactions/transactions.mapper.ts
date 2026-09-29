/**
 * transactions.mapper.ts
 * Maps a Prisma `Transaction` row (joined with its `Category`) to the public {@link
 * TransactionDto}. The field list is the whitelist — `userId`/`merchantKey`/`importBatchId` are
 * never sent to the client (CLAUDE.md security invariant).
 * Main exports: toTransactionDto, TransactionWithCategory
 * Spec: docs/spec/05a §5.4 (transaction DTO)
 */
import type { CategorySource, TransactionDto, TransactionSource, TransactionType } from '@campuscoin/shared';
import type { CategoryModel } from '../../generated/prisma/models/Category.js';
import type { TransactionModel } from '../../generated/prisma/models/Transaction.js';
import { fromDbDate } from '../../lib/dates.js';
import { toMoneyString } from '../../lib/money.js';

/** Decimal places stored for `transactions.ai_confidence` (`Decimal(4,3)`). */
const AI_CONFIDENCE_SCALE = 3;

/** A `Transaction` row read with its `category` relation included. */
export type TransactionWithCategory = TransactionModel & { category: CategoryModel };

/**
 * Converts a Prisma `Transaction` row (with `category` included) into the public
 * {@link TransactionDto}.
 * @param txn - Full row with its joined category, as read from the DB.
 */
export function toTransactionDto(txn: TransactionWithCategory): TransactionDto {
  return {
    id: txn.id,
    type: txn.type as TransactionType,
    categoryId: txn.categoryId,
    category: {
      id: txn.category.id,
      name: txn.category.name,
      type: txn.category.type as TransactionType,
      icon: txn.category.icon,
      color: txn.category.color,
    },
    amount: toMoneyString(txn.amount),
    currency: txn.currency,
    description: txn.description,
    txnDate: fromDbDate(txn.txnDate),
    source: txn.source as TransactionSource,
    recurringRuleId: txn.recurringRuleId,
    recurringPeriod: txn.recurringPeriod,
    categorySource: txn.categorySource as CategorySource,
    aiSuggestedCategoryId: txn.aiSuggestedCategoryId,
    aiConfidence: txn.aiConfidence ? toMoneyString(txn.aiConfidence, AI_CONFIDENCE_SCALE) : null,
    isAnomaly: txn.isAnomaly,
    isPossibleDuplicate: txn.isPossibleDuplicate,
    version: txn.version,
    deletedAt: txn.deletedAt ? txn.deletedAt.toISOString() : null,
    createdAt: txn.createdAt.toISOString(),
    updatedAt: txn.updatedAt.toISOString(),
  };
}
