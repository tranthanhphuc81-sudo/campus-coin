import { Prisma } from "@prisma/client";

import { notFound } from "../../lib/problem.js";
import {
  buildTipRecalculationContext,
  findLatestTipsRefreshAt,
  findTipById,
  listVisibleTips,
  replaceActiveTipsForMonth,
  resolveMonthStart,
  toWireRuleType,
  updateTipStatus,
  type TipTemplateRecord,
} from "./repository.js";
import { evaluateAllRuleCandidates, evaluateGeneralRule } from "./rules/index.js";
import type { TipCandidate } from "./rules/types.js";
import type { TipItem, TipsResponse } from "./types.js";

const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_all, key: string) => {
    return escapeHtml(variables[key] ?? "");
  });
}

function confidenceByHistoricalMonths(historyMonths: number): Prisma.Decimal {
  if (historyMonths >= 3) {
    return new Prisma.Decimal(1);
  }

  if (historyMonths === 2) {
    return new Prisma.Decimal(0.75);
  }

  return new Prisma.Decimal(0.5);
}

function recencyByAgeDays(ageDays: number): Prisma.Decimal {
  const decrements = Math.min(ageDays * 0.05, 0.5);
  return new Prisma.Decimal(1).sub(decrements).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function toTipKey(ruleType: string, categoryId: number | null | undefined): string {
  return `${ruleType}:${categoryId ?? "none"}`;
}

function pickTemplateByRule(
  templates: TipTemplateRecord[],
): Map<TipTemplateRecord["ruleType"], TipTemplateRecord> {
  const map = new Map<TipTemplateRecord["ruleType"], TipTemplateRecord>();

  for (const template of templates) {
    if (!map.has(template.ruleType)) {
      map.set(template.ruleType, template);
    }
  }

  return map;
}

function mapTipRowToWire(row: Awaited<ReturnType<typeof listVisibleTips>>[number]): TipItem {
  const wireStatus = row.status === "PINNED" ? "pinned" : "active";

  return {
    id: String(row.id),
    ruleType: toWireRuleType(row.template.ruleType),
    categoryId: row.categoryId,
    title: row.renderedTitle,
    body: row.renderedBody,
    impactAmount: row.impactAmount.toFixed(2),
    score: Number(row.score.toString()),
    status: wireStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function ensureTipsCalculated(userId: string, now: Date): Promise<Date> {
  const context = await buildTipRecalculationContext(userId, now);
  const latestRefreshAt = await findLatestTipsRefreshAt(userId, context.monthStart);

  if (latestRefreshAt && now.getTime() - latestRefreshAt.getTime() <= REFRESH_INTERVAL_MS) {
    return context.monthStart;
  }

  const templateByRule = pickTemplateByRule(context.templates);
  const dismissedKeySet = new Set(
    context.activeDismissals.map((item) => toTipKey(item.ruleType, item.categoryId)),
  );

  const historyByKey = new Map(
    context.existingPeriodTips.map((tip) => {
      const key = toTipKey(toWireRuleType(tip.template.ruleType), tip.categoryId);
      const ageDays = Math.max(
        0,
        Math.floor((now.getTime() - tip.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
      );
      return [key, ageDays] as const;
    }),
  );

  const baseCandidates = evaluateAllRuleCandidates({
    daysElapsed: context.daysElapsed,
    daysInMonth: context.daysInMonth,
    categorySpending: context.categorySpending,
    recentExpenseTransactions: context.recentExpenseTransactions,
    recurringSubscriptions: context.recurringSubscriptions,
    monthIncome: context.monthIncome,
    projectedTotalExpense:
      context.daysElapsed >= 5
        ? context.projectedTotalExpense
            .div(context.daysElapsed)
            .mul(context.daysInMonth)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
        : context.projectedTotalExpense,
    monthlySavingsGoal: context.monthlySavingsGoal,
    allowanceBaseline: context.allowanceBaseline,
  });

  const candidates: TipCandidate[] = [...baseCandidates, evaluateGeneralRule()].filter(
    (candidate) => !dismissedKeySet.has(toTipKey(candidate.ruleType, candidate.categoryId ?? null)),
  );

  const rows = candidates
    .map((candidate) => {
      const template = templateByRule.get(candidate.ruleType);
      if (!template) {
        return null;
      }

      const ageDays =
        historyByKey.get(toTipKey(candidate.ruleType, candidate.categoryId ?? null)) ?? 0;
      const confidence = confidenceByHistoricalMonths(candidate.historicalMonths);
      const recency = recencyByAgeDays(ageDays);
      const score = candidate.impactAmount
        .mul(confidence)
        .mul(recency)
        .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);

      return {
        templateId: template.id,
        categoryId: candidate.categoryId ?? null,
        renderedTitle: renderTemplate(template.titleTpl, candidate.variables),
        renderedBody: renderTemplate(template.bodyTpl, candidate.variables),
        impactAmount: candidate.impactAmount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
        score,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((left, right) => right.score.comparedTo(left.score));

  await replaceActiveTipsForMonth({
    userId,
    monthStart: context.monthStart,
    rows,
  });

  return context.monthStart;
}

export async function listTips(userId: string): Promise<TipsResponse> {
  const now = new Date();
  const monthStart = await ensureTipsCalculated(userId, now);
  const rows = await listVisibleTips({ userId, monthStart });

  const sorted = [...rows].sort((left, right) => {
    if (left.status === "PINNED" && right.status !== "PINNED") {
      return -1;
    }

    if (left.status !== "PINNED" && right.status === "PINNED") {
      return 1;
    }

    return right.score.comparedTo(left.score);
  });

  return {
    month: monthStart.toISOString().slice(0, 7),
    generatedAt: now.toISOString(),
    tips: sorted.map(mapTipRowToWire),
  };
}

export async function listTopTipsForDashboard(userId: string, limit = 3): Promise<TipItem[]> {
  const data = await listTips(userId);
  return data.tips.slice(0, limit);
}

async function setTipStatus(params: {
  userId: string;
  tipId: string;
  status: "ACTIVE" | "PINNED" | "DISMISSED";
  dismissedUntil?: Date | null;
}): Promise<void> {
  const tipId = BigInt(params.tipId);
  const tip = await findTipById({ userId: params.userId, tipId });

  if (!tip) {
    throw notFound("Tip was not found.");
  }

  await updateTipStatus({
    tipId,
    status: params.status,
    dismissedUntil: params.dismissedUntil,
  });
}

export async function pinTip(userId: string, tipId: string): Promise<void> {
  await setTipStatus({ userId, tipId, status: "PINNED", dismissedUntil: null });
}

export async function unpinTip(userId: string, tipId: string): Promise<void> {
  await setTipStatus({ userId, tipId, status: "ACTIVE", dismissedUntil: null });
}

export async function dismissTip(userId: string, tipId: string): Promise<void> {
  const dismissedUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await setTipStatus({ userId, tipId, status: "DISMISSED", dismissedUntil });
}

export function getCurrentMonthForTimezone(timezone: string): string {
  const monthStart = resolveMonthStart(new Date(), timezone);
  return monthStart.toISOString().slice(0, 7);
}
