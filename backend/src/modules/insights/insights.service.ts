/**
 * insights.service.ts
 * HTTP-facing business logic for `/api/v1/insights/*` (docs/spec/05b §5.9, docs/spec/07 §7.3.3):
 * paginated history, single-month lookup, and the "regenerate" trigger. The actual generation work
 * (LLM/template) lives in `insights.generate.ts` and only ever runs inside the `insight.generate`
 * BullMQ worker — this module only enqueues it.
 * Main exports: list, getByMonth, regenerate, existsForUser, summariesByMonths
 * Spec: docs/spec/05b §5.9 · docs/spec/07 §7.3.3 · docs/spec/05c §5.12 (bookmarks)
 */
import {
  INSIGHT_MAX_REGENERATE_PER_MONTH,
  DEFAULT_TIMEZONE,
  type InsightDto,
  type InsightFlaggedPattern,
  type InsightListResponse,
  type ListInsightsQueryInput,
} from '@campuscoin/shared';
import { InsightStatus } from '../../generated/prisma/enums.js';
import type { InsightModel } from '../../generated/prisma/models/Insight.js';
import { insightGenerateQueue } from '../../jobs/queues.js';
import { addDays, diffInDays, firstDayOfMonth, fromDbDate, todayInTimeZone, type LocalDate } from '../../lib/dates.js';
import { buildPaginationMeta, parsePagination } from '../../lib/pagination.js';
import { conflict, notFound, rateLimited, validationFailed } from '../../lib/problem.js';
import { truncate } from '../../lib/strings.js';
import { insightsRepository } from './insights.repository.js';

/** Maps a DB row to the API DTO, computing `regenerateRemaining` from the fixed monthly cap. */
function toInsightDto(row: InsightModel): InsightDto {
  return {
    id: row.id,
    month: row.month.toISOString().slice(0, 10),
    summaryText: row.summaryText,
    tipText: row.tipText,
    flaggedPatterns: (row.flaggedPatterns as unknown as InsightFlaggedPattern[] | null) ?? [],
    savingsRatePct: (row.statsSnapshot as { savingsRatePct?: number } | null)?.savingsRatePct ?? null,
    generator: row.generator,
    status: row.status,
    regenerateCount: row.regenerateCount,
    regenerateRemaining: Math.max(0, INSIGHT_MAX_REGENERATE_PER_MONTH - row.regenerateCount),
    generatedAt: row.generatedAt ? row.generatedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** `GET /insights`: the caller's insight history, newest month first. */
export async function list(userId: string, query: ListInsightsQueryInput): Promise<InsightListResponse> {
  const { page, limit, skip, take } = parsePagination(query);
  const [rows, total] = await insightsRepository.list(userId, skip, take);
  const meta = buildPaginationMeta(page, limit, total);
  return { data: rows.map(toInsightDto), page: meta.page, limit: meta.limit, total: meta.total };
}

/**
 * `GET /insights/:month`.
 * @throws {AppError} 404 when no insight exists for that month (never/not-yet generated, or
 *   another user's row — same 404 either way, CLAUDE.md cross-tenant invariant).
 */
export async function getByMonth(userId: string, monthParam: LocalDate): Promise<InsightDto> {
  const month = firstDayOfMonth(monthParam);
  const row = await insightsRepository.findByUserMonth(userId, month);
  if (!row) throw notFound('No insight found for that month.');
  return toInsightDto(row);
}

/** Seconds remaining until the first day of the month after `today` — used as `Retry-After`. */
function secondsUntilNextMonth(today: LocalDate): number {
  const nextMonth = firstDayOfMonth(addDays(firstDayOfMonth(today), 32));
  return diffInDays(today, nextMonth) * 86_400;
}

/**
 * `POST /insights/:month/regenerate`: atomically claims a regenerate slot and enqueues a fresh
 * `insight.generate` job. The controller sends the `202` response; this only does the work.
 * @throws {AppError} 422 for the current/a future month; 404 when no insight row exists yet
 *   (regenerate never creates a first-time row, only re-runs an existing one); 409 when a
 *   generation is already in flight; 429 (with `Retry-After`) once the monthly cap is used up.
 */
export async function regenerate(userId: string, monthParam: LocalDate): Promise<void> {
  const month = firstDayOfMonth(monthParam);
  const today = todayInTimeZone(DEFAULT_TIMEZONE);
  if (month >= firstDayOfMonth(today)) {
    throw validationFailed([{ field: 'month', message: 'Cannot regenerate an insight for the current or a future month.' }]);
  }

  // Atomic claim-and-increment (BR review fix): avoids a check-then-increment race between two
  // concurrent regenerate calls, both of which could otherwise pass a plain read-then-write check.
  const claimed = await insightsRepository.regenerateAtomic(userId, month, INSIGHT_MAX_REGENERATE_PER_MONTH);
  if (claimed.count === 0) {
    const existing = await insightsRepository.findByUserMonth(userId, month);
    if (!existing) throw notFound('No insight found for that month.');
    if (existing.status === InsightStatus.queued || existing.status === InsightStatus.processing) {
      throw conflict('A generation is already in progress for this month.');
    }
    throw rateLimited(secondsUntilNextMonth(today), 'Regenerate limit reached for this month (3/month).');
  }

  const updated = await insightsRepository.findByUserMonth(userId, month);
  const newRegenerateCount = updated?.regenerateCount ?? 1;
  // `-r${n}` matters: BullMQ keeps completed jobs (removeOnComplete), so reusing the same jobId as
  // an earlier completed run would make BullMQ silently drop this new job.
  await insightGenerateQueue.add('insight-generate', { userId, month }, { jobId: `insight-${userId}-${month}-r${newRegenerateCount}` });
}

/** Max characters of `summaryText` kept in a bookmark's `target.excerpt` (P14 §5.12). */
const BOOKMARK_EXCERPT_MAX_CHARS = 140;

/**
 * P14 §5.12 (`POST /bookmarks`): whether an insight exists for `userId`+`month` — used so
 * bookmarking an insight 404s the same way any other cross-tenant lookup does (CLAUDE.md invariant).
 * @param userId - Caller (from the verified token).
 * @param month - First-of-month local date, parsed from the bookmark's `targetRef`.
 */
export async function existsForUser(userId: string, month: LocalDate): Promise<boolean> {
  return (await insightsRepository.findByUserMonth(userId, month)) !== null;
}

/**
 * P14 §5.12 (`GET /bookmarks`): batch title/excerpt lookup for insight bookmarks. `title` is
 * always `null` — the frontend formats "Insight – <Month> <Year>" itself from the month string,
 * it needs no server-rendered title. Months owned by another user, or never generated, are simply
 * absent from the map — the caller (bookmarks service) turns a miss into `target.available: false`.
 * @param userId - Caller (from the verified token).
 * @param months - First-of-month local dates (bookmark `targetRef`s).
 */
export async function summariesByMonths(userId: string, months: LocalDate[]): Promise<Map<string, { title: null; excerpt: string }>> {
  const rows = await insightsRepository.findByUserMonths(userId, months);
  const map = new Map<string, { title: null; excerpt: string }>();
  for (const row of rows) {
    map.set(fromDbDate(row.month), { title: null, excerpt: truncate(row.summaryText ?? '', BOOKMARK_EXCERPT_MAX_CHARS) ?? '' });
  }
  return map;
}
