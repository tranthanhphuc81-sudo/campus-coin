/**
 * tips.service.ts
 * Business logic for the rule-based savings-tips engine (docs/spec/05b §5.10): `refreshForUser`
 * (called by the `tips.refresh` BullMQ processor) recomputes and ranks a user's tips for the
 * CURRENT month; `listCurrentPeriod`/`pin`/`unpin`/`dismiss` back the HTTP endpoints. A tip not
 * owned by the caller is a 404, never a 403 (CLAUDE.md cross-tenant invariant).
 * Main exports: refreshForUser, listCurrentPeriod, pin, unpin, dismiss, existsForUser, summariesByIds
 * Spec: docs/spec/05b §5.10 (Bảng 23) · docs/spec/07 §7.3.3 (tips routes) · docs/spec/05c §5.12 (bookmarks)
 */
import {
  TIP_DISMISS_DAYS,
  TIP_GENERAL_FIXED_SCORE,
  TIP_PROJECTION_MIN_DAY,
  TipRuleType,
  UserStatus,
  UserTipStatus,
  type TipDto,
  type TipListResponse,
} from '@campuscoin/shared';
import type { CategoryModel } from '../../generated/prisma/models/Category.js';
import { addDays, firstDayOfMonth, fromDbDate, toDbDate, todayInTimeZone, toUserLocalDate, type LocalDate } from '../../lib/dates.js';
import { cacheDel } from '../../lib/cache.js';
import { dashboardKey } from '../../lib/cacheKeys.js';
import { logger } from '../../lib/logger.js';
import { Decimal, toMoneyString } from '../../lib/money.js';
import { notFound } from '../../lib/problem.js';
import { truncate } from '../../lib/strings.js';
import { usersRepository } from '../users/users.repository.js';
import { r0General } from './rules/r0.js';
import { r1OverBudget } from './rules/r1.js';
import { r2AboveAverage } from './rules/r2.js';
import { r3SmallFrequent } from './rules/r3.js';
import { r4Subscriptions } from './rules/r4.js';
import { r5SavingsGap } from './rules/r5.js';
import { r6WeekendSpike } from './rules/r6.js';
import { tipsRepository, type UserTipWithRule } from './tips.repository.js';
import { computeScore, confidenceFor, recencyFor, renderTemplate, selectTemplate } from './tips.render.js';
import type { AverageCategoryStat, SavingsGapInput, TipCandidate } from './tips.types.js';

/** DB column sizes (`user_tips.rendered_title`/`rendered_body`), see `prisma/schema.prisma`. */
const RENDERED_TITLE_MAX = 200;
const RENDERED_BODY_MAX = 600;

/** The expense category with the largest positive `projected - avg3` this month, for R5's `{category}`. */
function findTopOverspendCategory(categories: readonly AverageCategoryStat[]): { categoryName: string } | null {
  let best: { categoryName: string; diff: Decimal } | null = null;
  for (const c of categories) {
    if (c.avg3 == null) continue;
    const diff = c.projected.minus(c.avg3);
    if (diff.greaterThan(0) && (best === null || diff.greaterThan(best.diff))) best = { categoryName: c.categoryName, diff };
  }
  return best ? { categoryName: best.categoryName } : null;
}

/**
 * Recomputes and ranks `userId`'s savings tips for the current month (§5.10). Called by the
 * `tips.refresh` BullMQ processor (debounced 5 min/user after a transaction event). Throws on a
 * genuine failure so the processor's 2-attempt retry kicks in — never swallows an error here.
 * @param userId - The user to refresh; a missing/non-active account is a no-op (logged, not thrown).
 */
export async function refreshForUser(userId: string): Promise<void> {
  const user = await usersRepository.findById(userId);
  if (!user || user.status !== UserStatus.ACTIVE) {
    logger.warn({ userId }, '[tips] skipping refresh: user missing or not active');
    return;
  }

  const today = todayInTimeZone(user.timezone);
  const period = firstDayOfMonth(today);
  const dayOfMonth = Number(today.slice(8, 10));
  const projectionsReady = dayOfMonth >= TIP_PROJECTION_MIN_DAY;
  const allowanceBaseline = user.monthlyAllowanceBaseline;
  const savingsGoal = user.monthlySavingsGoal;

  await tipsRepository.reactivateExpiredDismissals(userId, today);

  const [monthsAvailable, budgetedCategories, averageCategories, smallFrequentCategories, subscriptions, savingsGapTotals, weekend, templates] = await Promise.all([
    tipsRepository.monthsOfHistoryAvailable(userId, period),
    projectionsReady ? tipsRepository.budgetedCategoryProjections(userId, period, today) : Promise.resolve([]),
    projectionsReady ? tipsRepository.categoryProjectionsWithAvg3(userId, period, today) : Promise.resolve([]),
    allowanceBaseline ? tipsRepository.smallFrequentByCategory(userId, allowanceBaseline, today) : Promise.resolve([]),
    tipsRepository.activeSubscriptions(userId),
    projectionsReady && savingsGoal ? tipsRepository.savingsGapTotals(userId, period, today) : Promise.resolve(null),
    tipsRepository.weekendStats(userId, today),
    tipsRepository.activeTemplates(),
  ]);

  const savingsGapInput: SavingsGapInput | null = savingsGapTotals && savingsGoal
    ? {
        incomeToDate: savingsGapTotals.incomeToDate,
        allowanceBaseline: allowanceBaseline ?? null,
        projectedTotalExpense: savingsGapTotals.projectedTotalExpense,
        savingsGoal,
        topOverspendCategory: findTopOverspendCategory(averageCategories),
      }
    : null;

  const candidates: TipCandidate[] = [
    ...r0General(),
    ...r1OverBudget(budgetedCategories),
    ...r2AboveAverage(averageCategories),
    ...r3SmallFrequent(smallFrequentCategories),
    ...r4Subscriptions(subscriptions),
    ...r5SavingsGap(savingsGapInput),
    ...r6WeekendSpike(weekend),
  ];

  // Sequential (not Promise.all): a small, per-user candidate list in a background job, not a hot
  // path — keeping the DB round-trips serial here is simpler to reason about than parallelizing.
  const keepIds: bigint[] = [];
  for (const candidate of candidates) {
    const dismissed = await tipsRepository.isDismissedForRuleCategory(userId, candidate.ruleType, candidate.categoryId, today);
    if (dismissed) continue;

    const seed = `${userId}:${period}:${candidate.ruleType}`;
    const template = selectTemplate(templates, candidate.ruleType, candidate.vars, seed);
    if (!template) continue;

    const existing = await tipsRepository.findExistingForPeriod(userId, template.id, candidate.categoryId, period);
    const confidence = confidenceFor(monthsAvailable);
    const recency = existing && existing.status !== UserTipStatus.PINNED ? recencyFor(toUserLocalDate(existing.createdAt, user.timezone), today) : recencyFor(null, today);
    const score = candidate.ruleType === TipRuleType.GENERAL ? new Decimal(TIP_GENERAL_FIXED_SCORE) : computeScore(candidate.impact, confidence, recency);

    const title = renderTemplate(template.titleTpl, candidate.vars, RENDERED_TITLE_MAX);
    const body = renderTemplate(template.bodyTpl, candidate.vars, RENDERED_BODY_MAX);

    const row = await tipsRepository.upsertRendered(userId, template.id, candidate.categoryId, period, title, body, candidate.impact, score);
    keepIds.push(row.id);
  }

  await tipsRepository.deleteStaleActive(userId, period, keepIds);
  await cacheDel(dashboardKey(userId, period));
}

/** Maps a `UserTip` row (+ joined `ruleType`) to its API DTO. */
function toTipDto(row: UserTipWithRule, categoriesById: Map<number, CategoryModel>): TipDto {
  return {
    id: row.id.toString(),
    ruleType: row.template.ruleType,
    categoryId: row.categoryId,
    categoryName: row.categoryId !== null ? (categoriesById.get(row.categoryId)?.name ?? null) : null,
    period: fromDbDate(row.period),
    title: row.renderedTitle,
    body: row.renderedBody,
    impactAmount: toMoneyString(row.impactAmount),
    score: row.score.toNumber(),
    status: row.status,
    dismissedUntil: row.dismissedUntil ? fromDbDate(row.dismissedUntil) : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** `GET /tips`: the caller's current-period tips, pinned first then score descending. */
export async function listCurrentPeriod(userId: string): Promise<TipListResponse> {
  const user = await usersRepository.findById(userId);
  if (!user) throw notFound('Account not found.');
  const period = firstDayOfMonth(todayInTimeZone(user.timezone));

  const rows = await tipsRepository.currentPeriodForUser(userId, period);
  const categoryIds = [...new Set(rows.map((r) => r.categoryId).filter((id): id is number => id !== null))];
  const categoriesById = await tipsRepository.categoriesByIds(categoryIds);
  return { data: rows.map((row) => toTipDto(row, categoriesById)) };
}

/** Applies a status transition to one of the caller's own tips (404 if missing/not owned). */
async function applyStatus(userId: string, id: bigint, status: UserTipStatus, dismissedUntil: LocalDate | null): Promise<TipDto> {
  const existing = await tipsRepository.findOwned(userId, id);
  if (!existing) throw notFound('Tip not found.');

  const updated = await tipsRepository.setStatus(id, status, dismissedUntil ? toDbDate(dismissedUntil) : null);
  const categoriesById = updated.categoryId !== null ? await tipsRepository.categoriesByIds([updated.categoryId]) : new Map<number, CategoryModel>();
  await cacheDel(dashboardKey(userId, fromDbDate(updated.period)));
  return toTipDto(updated, categoriesById);
}

/** `POST /tips/:id/pin` — pins one of the caller's own tips. @throws {AppError} 404 if missing/not owned. */
export function pin(userId: string, id: bigint): Promise<TipDto> {
  return applyStatus(userId, id, UserTipStatus.PINNED, null);
}

/** `POST /tips/:id/unpin` — unpins (back to `active`) one of the caller's own tips. @throws {AppError} 404 if missing/not owned. */
export function unpin(userId: string, id: bigint): Promise<TipDto> {
  return applyStatus(userId, id, UserTipStatus.ACTIVE, null);
}

/**
 * `POST /tips/:id/dismiss` — hides one of the caller's own tips for `TIP_DISMISS_DAYS`.
 * @throws {AppError} 404 if missing/not owned.
 */
export async function dismiss(userId: string, id: bigint): Promise<TipDto> {
  const user = await usersRepository.findById(userId);
  if (!user) throw notFound('Tip not found.');
  const until = addDays(todayInTimeZone(user.timezone), TIP_DISMISS_DAYS);
  return applyStatus(userId, id, UserTipStatus.DISMISSED, until);
}

/** Max characters of `renderedBody` kept in a bookmark's `target.excerpt` (P14 §5.12). */
const BOOKMARK_EXCERPT_MAX_CHARS = 140;

/**
 * P14 §5.12 (`POST /bookmarks`): whether tip `id` exists and is owned by `userId` — used so
 * bookmarking a tip 404s the same way any other cross-tenant lookup does (CLAUDE.md invariant).
 * @param userId - Caller (from the verified token).
 * @param id - `user_tips.id`, parsed from the bookmark's `targetRef`.
 */
export async function existsForUser(userId: string, id: bigint): Promise<boolean> {
  return (await tipsRepository.findOwned(userId, id)) !== null;
}

/**
 * P14 §5.12 (`GET /bookmarks`): batch title/excerpt lookup for tip bookmarks. IDs owned by another
 * user, or no longer existing, are simply absent from the returned map — the caller (bookmarks
 * service) turns a miss into `target.available: false`.
 * @param userId - Caller (from the verified token).
 * @param ids - `user_tips.id` values, as strings (bookmark `targetRef`s).
 */
export async function summariesByIds(userId: string, ids: string[]): Promise<Map<string, { title: string; excerpt: string }>> {
  const rows = await tipsRepository.findByIds(userId, ids.map(BigInt));
  const map = new Map<string, { title: string; excerpt: string }>();
  for (const row of rows) {
    map.set(row.id.toString(), { title: row.renderedTitle, excerpt: truncate(row.renderedBody, BOOKMARK_EXCERPT_MAX_CHARS) ?? '' });
  }
  return map;
}
