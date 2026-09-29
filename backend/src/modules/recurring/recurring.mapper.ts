/**
 * recurring.mapper.ts
 * Maps a Prisma `RecurringRule` row (joined with its `Category`) to the public
 * {@link RecurringRuleDto}. The field list is the whitelist — `userId` is never sent to the
 * client (CLAUDE.md security invariant).
 * Main exports: toRecurringRuleDto, RecurringRuleWithCategory
 * Spec: docs/spec/05a §5.4.2 (recurring rule DTO)
 */
import type { RecurringRuleDto, TransactionType } from '@campuscoin/shared';
import type { CategoryModel } from '../../generated/prisma/models/Category.js';
import type { RecurringRuleModel } from '../../generated/prisma/models/RecurringRule.js';
import { fromDbDate } from '../../lib/dates.js';
import { toMoneyString } from '../../lib/money.js';

/** A `RecurringRule` row read with its `category` relation included. */
export type RecurringRuleWithCategory = RecurringRuleModel & { category: CategoryModel };

/**
 * Converts a Prisma `RecurringRule` row (with `category` included) into the public
 * {@link RecurringRuleDto}.
 * @param rule - Full row with its joined category, as read from the DB.
 */
export function toRecurringRuleDto(rule: RecurringRuleWithCategory): RecurringRuleDto {
  return {
    id: rule.id,
    categoryId: rule.categoryId,
    category: {
      id: rule.category.id,
      name: rule.category.name,
      type: rule.category.type as TransactionType,
      icon: rule.category.icon,
      color: rule.category.color,
    },
    type: rule.type as TransactionType,
    amount: toMoneyString(rule.amount),
    description: rule.description,
    frequency: rule.frequency,
    intervalCount: rule.intervalCount,
    dayOfMonth: rule.dayOfMonth,
    dayOfWeek: rule.dayOfWeek,
    startDate: fromDbDate(rule.startDate),
    endDate: rule.endDate ? fromDbDate(rule.endDate) : null,
    nextRunDate: fromDbDate(rule.nextRunDate),
    isActive: rule.isActive,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}
