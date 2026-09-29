/**
 * demo.ts
 * Demo accounts and sample data for examiner/demo purposes (`npm run db:seed -w backend -- --demo`).
 * Builds the 5 accounts from Bảng 65 (docs/spec/10 §11.5) with the datasets from Bảng 69
 * (docs/spec/12 §12.3): An (6 months, AI on, budgets+insights+tips), Bình (3 months, AI off,
 * last-month Food/Entertainment spike, 4 recurring subscriptions), Chi (empty, for onboarding/CSV
 * import demos) and a disabled account. Refuses to run when `NODE_ENV=production` and is
 * idempotent: every user's own transactions/budgets/insights/tips/recurring rules are wiped and
 * deterministically regenerated on every call (the `User` row itself is upserted).
 *
 * Everything here is template/rule-based — no LLM call is ever made at seed time, so this works
 * identically with `AI_API_KEY` empty (CLAUDE.md "AI" invariant).
 * Main exports: SeedDemoResult, seedDemo
 * Spec: docs/spec/10 §11.5 (Bảng 65 – demo accounts) · docs/spec/12 §12.3 (Bảng 69 – test datasets)
 */
import {
  CategorySource,
  InsightGenerator,
  RecurringFrequency,
  Role,
  SYSTEM_OWNER_KEY,
  TransactionSource,
  TransactionType,
  UserStatus,
  UserTipStatus,
} from '@campuscoin/shared';
import type { Prisma } from '../../src/generated/prisma/client.js';
import { encrypt } from '../../src/lib/crypto.js';
import { addDays, firstDayOfMonth, lastDayOfMonth, toDbDate, trailingMonths, type LocalDate } from '../../src/lib/dates.js';
import { average, Decimal, sum, toMoney } from '../../src/lib/money.js';
import { normalizeMerchantKey } from '../../src/lib/merchantKey.js';
import { hashPassword } from '../../src/lib/password.js';
import type { AppPrismaClient } from '../../src/lib/prisma.js';
import { buildOtpauthUrl, generateTotpCode } from '../../src/lib/totp.js';
import { nextOccurrenceAfter, occurrenceOnOrAfter, periodKey, type RecurrenceSpec } from '../../src/lib/recurrence.js';
import { insightsRepository } from '../../src/modules/insights/insights.repository.js';
import { buildInsightSnapshot } from '../../src/modules/insights/insights.stats.js';
import { buildTemplateInsight } from '../../src/modules/insights/insight.template.js';
import { TIP_TEMPLATES } from './data/tip-templates.js';
import { mulberry32, pick, randomAmount, randomInt } from './rng.js';

/** Counts returned by {@link seedDemo}. */
export interface SeedDemoResult {
  usersCreated: number;
  transactionsCreated: number;
}

// ---------------------------------------------------------------------------
// Fixed constants — everything here must stay stable across runs so the seed
// is byte-for-byte reproducible (Bảng 69: "Deterministic").
// ---------------------------------------------------------------------------

const DEMO_ADMIN_EMAIL = 'admin@campuscoin.demo';
const DEMO_ADMIN_PASSWORD = 'Admin@Campus2026!';
/**
 * Fixed (never regenerated) demo TOTP secret, so the printed otpauth URL/QR never changes across
 * re-seeds. Generated once with `generateTotpSecret()` and hardcoded here (32 Base32 chars = 20
 * bytes, well above otplib's 128-bit minimum) — never used for a real account.
 */
const DEMO_ADMIN_TOTP_SECRET = 'QUQ7AGY6LOEOO37LX5Q75X3CQE366WUH';
const DEMO_STUDENT_PASSWORD = 'Student@Campus2026!';

/**
 * Fixed "current month" anchor for every demo dataset. Deliberately NOT derived from `new Date()`:
 * An's 6 months and Bình's 3 months (and Bình's last-month-vs-trailing-average comparison) must stay
 * internally consistent with each other no matter when someone actually runs the seed, months/years
 * after this phase was written. Bump this by hand if the demo is ever refreshed for a later cohort.
 */
const DEMO_ANCHOR_MONTH: LocalDate = '2026-09-01';

/**
 * One fixed PRNG seed for the whole run (byte-identical output on every re-run), but each demo user
 * gets a DISTINCT sub-seed (`DEMO_SEED + <small offset>`) — otherwise every user fed from the same
 * seed would produce identical amounts/days, which looks obviously fake side-by-side in a demo.
 */
const DEMO_SEED = 20260101;
const AN_RNG_SEED = DEMO_SEED + 1;
const BINH_RNG_SEED = DEMO_SEED + 2;

// ---------------------------------------------------------------------------
// Small local helpers
// ---------------------------------------------------------------------------

/** One transaction to insert, before it is attached to a user/currency. */
interface DemoTxn {
  categoryId: number;
  type: TransactionType;
  amount: string;
  description: string;
  txnDate: LocalDate;
}

/** A weighted expense category profile used to generate random spending. */
interface ExpenseProfile {
  categoryName: string;
  weight: number;
  min: number;
  max: number;
  descriptions: readonly string[];
}

/** Loads every system default category into a `${type}:${name}` -> id map (populated by `seedBase`). */
async function loadSystemCategories(prisma: AppPrismaClient): Promise<Map<string, number>> {
  const rows = await prisma.category.findMany({ where: { ownerKey: SYSTEM_OWNER_KEY } });
  return new Map(rows.map((c) => [`${c.type}:${c.name}`, c.id]));
}

/** Looks up a system category id, or throws a clear error (means `seedBase` has not run yet). */
function categoryId(categories: Map<string, number>, type: TransactionType, name: string): number {
  const id = categories.get(`${type}:${name}`);
  if (id === undefined) throw new Error(`Demo seed: missing system category "${name}" (${type}) — run seedBase first.`);
  return id;
}

/** Clamps `day` to `month`'s last day and returns the resulting local date. */
function dateInMonth(month: LocalDate, day: number): LocalDate {
  const yearMonth = month.slice(0, 7);
  const maxDay = Number(lastDayOfMonth(month).slice(8, 10));
  return `${yearMonth}-${String(Math.min(day, maxDay)).padStart(2, '0')}`;
}

/** A random day (1..last day) within `month`. */
function randomDayInMonth(rng: () => number, month: LocalDate): number {
  const maxDay = Number(lastDayOfMonth(month).slice(8, 10));
  return randomInt(rng, 1, maxDay);
}

/** Weighted random pick (weights need not sum to 1 — normalised internally). */
function pickWeighted<T extends { weight: number }>(rng: () => number, items: readonly T[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rng() * total;
  for (const item of items) {
    if (r < item.weight) return item;
    r -= item.weight;
  }
  return items[items.length - 1] as T;
}

/**
 * Splits `total` into `count` positive money amounts (2dp) that sum EXACTLY to `total` — used so
 * Bình's engineered "+40%/+60%" month reads as several real purchases, not one suspicious lump sum.
 * Uses a stick-breaking method on whole cents so every segment is guaranteed >= $0.01.
 */
function splitTotalAcross(rng: () => number, total: Decimal, count: number): string[] {
  const totalCents = total.times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  const segments = Math.max(1, Math.min(count, totalCents));
  if (segments === 1) return [total.toFixed(2)];

  const cutSet = new Set<number>();
  while (cutSet.size < segments - 1) cutSet.add(randomInt(rng, 1, totalCents - 1));
  const cuts = [0, ...[...cutSet].sort((a, b) => a - b), totalCents];

  const amounts: string[] = [];
  for (let i = 0; i < cuts.length - 1; i += 1) {
    const cents = (cuts[i + 1] as number) - (cuts[i] as number);
    amounts.push((cents / 100).toFixed(2));
  }
  return amounts;
}

/** Sum of the amounts of every `categoryId`-matching entry in `txns`. */
function sumForCategory(txns: readonly DemoTxn[], id: number): Decimal {
  return sum(txns.filter((t) => t.categoryId === id).map((t) => t.amount));
}

/** Fills `{category}`/`{amount}`/`{percent}` placeholders in a tip template. */
function renderTip(titleTpl: string, bodyTpl: string, vars: { category?: string; amount?: string; percent?: string }): { title: string; body: string } {
  const fill = (s: string): string =>
    s
      .replaceAll('{category}', vars.category ?? '')
      .replaceAll('{amount}', vars.amount ?? '')
      .replaceAll('{percent}', vars.percent ?? '');
  return { title: fill(titleTpl), body: fill(bodyTpl) };
}

/** Deletes every demo-generated row owned by `userId` so it can be deterministically regenerated. */
async function wipeUserData(tx: AppPrismaClient | Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.userTip.deleteMany({ where: { userId } });
  await tx.insight.deleteMany({ where: { userId } });
  await tx.transaction.deleteMany({ where: { userId } });
  await tx.recurringRule.deleteMany({ where: { userId } });
  await tx.budget.deleteMany({ where: { userId } });
  // BUGFIX (found while wiring up P18's E2E session reuse): `Transaction.importBatchId` is
  // `onDelete: Restrict`, so transactions must already be gone (deleted above) before this can run.
  // Without it, `ImportBatch` rows (and their unique `[userId, fileSha256]` dedupe guard) survived
  // every demo re-seed, so replaying `09-csv-import.spec.ts`'s fixture CSV against Chi's account a
  // second time always 409'd with "This file has already been imported." instead of showing the
  // preview — a stale-fixture bug, not a real app bug (the dedupe guard itself is correct/intended).
  await tx.importBatch.deleteMany({ where: { userId } });
}

// ---------------------------------------------------------------------------
// An Nguyễn — 6 months, AI on, budgets + insights + tips
// ---------------------------------------------------------------------------

const AN_EXPENSE_PROFILES: readonly ExpenseProfile[] = [
  { categoryName: 'Food', weight: 0.32, min: 3, max: 15, descriptions: ['Campus Cafe latte', 'Canteen lunch special', 'Bubble tea with friends', 'Grab Food delivery', 'Grocery run - snacks', 'Coffee before class', 'Weekend brunch', 'Cơm trưa căn tin', 'Bánh mì buổi sáng'] },
  { categoryName: 'Transport', weight: 0.2, min: 1, max: 8, descriptions: ['Grab to campus', 'Bus pass top-up', 'Taxi to the airport', 'Bike repair', 'Motorbike fuel', 'Parking fee', 'Xe buýt đến trường'] },
  { categoryName: 'Academics', weight: 0.1, min: 8, max: 80, descriptions: ['Textbook rental', 'Printing lecture notes', 'Lab fee', 'Stationery supplies', 'Online course fee', 'Mua sách giáo trình'] },
  { categoryName: 'Entertainment', weight: 0.16, min: 5, max: 25, descriptions: ['Cinema tickets', 'Movie night with friends', 'Concert ticket', 'Board game night', 'Karaoke with classmates'] },
  { categoryName: 'Miscellaneous', weight: 0.14, min: 2, max: 20, descriptions: ['Phone case', 'Laundry service', 'Haircut', 'Gift wrap for a friend', 'Umbrella'] },
  { categoryName: 'Subscriptions', weight: 0.08, min: 2, max: 16, descriptions: ['Cloud storage top-up', 'App store purchase', 'Software subscription renewal'] },
];

const HOSTEL_DESCRIPTIONS = ['Dorm rent', 'Monthly hostel fee', 'Tiền trọ tháng'] as const;

const AN_EXTRA_INCOME = [
  { categoryName: 'Part-time Job', description: 'Part-time job pay', min: 40, max: 120 },
  { categoryName: 'Gift', description: 'Birthday gift money', min: 20, max: 60 },
  { categoryName: 'Other Income', description: 'Refund from a friend', min: 10, max: 40 },
] as const;

/** Generates one month's ~85-90 transactions for An (allowance, occasional extra income, rent, weighted expenses). */
function generateAnMonth(rng: () => number, month: LocalDate, categories: Map<string, number>): DemoTxn[] {
  const txns: DemoTxn[] = [];

  txns.push({
    categoryId: categoryId(categories, TransactionType.INCOME, 'Allowance'),
    type: TransactionType.INCOME,
    amount: '300.00',
    description: 'Monthly allowance from home',
    txnDate: dateInMonth(month, 1),
  });

  if (rng() < 0.4) {
    const extra = pick(rng, AN_EXTRA_INCOME);
    txns.push({
      categoryId: categoryId(categories, TransactionType.INCOME, extra.categoryName),
      type: TransactionType.INCOME,
      amount: randomAmount(rng, extra.min, extra.max),
      description: extra.description,
      txnDate: dateInMonth(month, randomInt(rng, 5, 25)),
    });
  }

  txns.push({
    categoryId: categoryId(categories, TransactionType.EXPENSE, 'Hostel/Rent'),
    type: TransactionType.EXPENSE,
    amount: randomAmount(rng, 150, 250),
    description: pick(rng, HOSTEL_DESCRIPTIONS),
    txnDate: dateInMonth(month, randomInt(rng, 1, 5)),
  });

  const count = randomInt(rng, 80, 86);
  for (let i = 0; i < count; i += 1) {
    const profile = pickWeighted(rng, AN_EXPENSE_PROFILES);
    txns.push({
      categoryId: categoryId(categories, TransactionType.EXPENSE, profile.categoryName),
      type: TransactionType.EXPENSE,
      amount: randomAmount(rng, profile.min, profile.max),
      description: pick(rng, profile.descriptions),
      txnDate: dateInMonth(month, randomDayInMonth(rng, month)),
    });
  }

  return txns;
}

/** Persists An's pre-generated template Insight + 2 UserTip rows for the anchor month. */
async function seedAnInsightAndTips(prisma: AppPrismaClient, userId: string, anchorMonth: LocalDate, categories: Map<string, number>): Promise<void> {
  const totals = await insightsRepository.totalsForMonth(userId, anchorMonth);
  const categoryStats = await insightsRepository.expenseCategoryStats(userId, anchorMonth);
  const largestExpense = await insightsRepository.largestExpenseThisMonth(userId, anchorMonth);
  const hasAnyPriorMonthHistory = await insightsRepository.hasAnyPriorMonthHistory(userId, anchorMonth);

  const allowanceBaseline = toMoney('300.00');
  const snapshot = buildInsightSnapshot({
    month: anchorMonth,
    currency: 'USD',
    allowanceBaseline,
    totalIncome: totals.income,
    totalExpense: totals.expense,
    categories: categoryStats,
    largestExpense,
    hasAnyPriorMonthHistory,
  });
  const text = buildTemplateInsight(snapshot, 'USD');

  const row = await insightsRepository.upsertQueued(userId, anchorMonth);
  await insightsRepository.setCompleted(row.id, {
    summaryText: text.summaryText,
    tipText: text.tipText,
    flaggedPatterns: snapshot.flaggedPatterns,
    statsSnapshot: {
      month: anchorMonth,
      currency: 'USD',
      totalIncome: totals.income.toString(),
      totalExpense: totals.expense.toString(),
      savingsRatePct: snapshot.savingsRatePct,
      allowanceBaseline: allowanceBaseline.toString(),
      categories: categoryStats.map((c) => ({
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        cur: c.cur.toString(),
        priorMonths: c.priorMonths.map((v) => v?.toString() ?? null),
        budgetLimit: c.budgetLimit?.toString() ?? null,
      })),
      largestExpense: largestExpense ? { categoryName: largestExpense.categoryName, amount: largestExpense.amount.toString() } : null,
      hasAnyPriorMonthHistory,
    },
    generator: InsightGenerator.TEMPLATE,
    model: null,
    promptVersion: null,
  });

  const budgetTplSeed = TIP_TEMPLATES.find((t) => t.code === 'R1_OVER_BUDGET_2');
  const generalTplSeed = TIP_TEMPLATES.find((t) => t.code === 'R0_GENERAL_1');
  if (!budgetTplSeed || !generalTplSeed) throw new Error('Demo seed: expected tip templates missing — run seedBase first.');
  const [budgetTpl, generalTpl] = await Promise.all([
    prisma.tipTemplate.findUniqueOrThrow({ where: { code: budgetTplSeed.code } }),
    prisma.tipTemplate.findUniqueOrThrow({ where: { code: generalTplSeed.code } }),
  ]);

  const budgetRendered = renderTip(budgetTpl.titleTpl, budgetTpl.bodyTpl, { category: 'Food', amount: '$12.00', percent: '95%' });
  const generalRendered = renderTip(generalTpl.titleTpl, generalTpl.bodyTpl, {});

  await prisma.userTip.createMany({
    data: [
      {
        userId,
        templateId: budgetTpl.id,
        categoryId: categoryId(categories, TransactionType.EXPENSE, 'Food'),
        period: toDbDate(anchorMonth),
        renderedTitle: budgetRendered.title,
        renderedBody: budgetRendered.body,
        impactAmount: toMoney('12.00'),
        score: new Decimal('8.5000'),
        status: UserTipStatus.ACTIVE,
      },
      {
        userId,
        templateId: generalTpl.id,
        categoryId: null,
        period: toDbDate(anchorMonth),
        renderedTitle: generalRendered.title,
        renderedBody: generalRendered.body,
        impactAmount: toMoney('15.00'),
        score: new Decimal('3.2000'),
        status: UserTipStatus.ACTIVE,
      },
    ],
  });
}

/** Seeds `an.nguyen@campuscoin.demo`: 6 months of data, budgets, one template insight, 2 tips. */
async function seedAn(prisma: AppPrismaClient, categories: Map<string, number>, studentPasswordHash: string): Promise<number> {
  const email = 'an.nguyen@campuscoin.demo';
  const months = trailingMonths(DEMO_ANCHOR_MONTH, 6);
  const anchorMonth = months[months.length - 1] as LocalDate;
  const rng = mulberry32(AN_RNG_SEED);

  const txns = months.flatMap((month) => generateAnMonth(rng, month, categories));

  const userData = {
    passwordHash: studentPasswordHash,
    fullName: 'Nguyễn Văn An',
    role: Role.STUDENT,
    status: UserStatus.ACTIVE,
    emailVerifiedAt: new Date(),
    monthlyAllowanceBaseline: toMoney('300.00'),
    currency: 'USD',
    aiOptIn: true,
  };

  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.upsert({ where: { email }, create: { email, ...userData }, update: userData });
    await wipeUserData(tx, u.id);

    await tx.transaction.createMany({
      data: txns.map((t) => ({
        userId: u.id,
        categoryId: t.categoryId,
        type: t.type,
        amount: toMoney(t.amount),
        currency: 'USD',
        description: t.description,
        merchantKey: normalizeMerchantKey(t.description),
        txnDate: toDbDate(t.txnDate),
        source: TransactionSource.MANUAL,
        categorySource: CategorySource.USER,
      })),
    });

    // BR (documented judgment call): budgets exist for the anchor month + the 2 months before it —
    // enough recent history for the budgets page/dashboard to show a trend, without seeding all 6.
    const budgetMonths = months.slice(-3);
    await tx.budget.createMany({
      data: budgetMonths.flatMap((m) => [
        { userId: u.id, categoryId: categoryId(categories, TransactionType.EXPENSE, 'Food'), month: toDbDate(m), limitAmount: toMoney('90.00'), alertThresholdPct: 80 },
        { userId: u.id, categoryId: categoryId(categories, TransactionType.EXPENSE, 'Transport'), month: toDbDate(m), limitAmount: toMoney('30.00'), alertThresholdPct: 80 },
      ]),
    });

    return u;
  });

  await seedAnInsightAndTips(prisma, user.id, anchorMonth, categories);

  return txns.length;
}

// ---------------------------------------------------------------------------
// Bình Trần — 3 months, AI off, last-month Food/Entertainment spike, subscriptions
// ---------------------------------------------------------------------------

const BINH_BASE_PROFILES: readonly ExpenseProfile[] = [
  { categoryName: 'Food', weight: 0.3, min: 3, max: 15, descriptions: ['Canteen lunch special', 'Bubble tea with friends', 'Grab Food delivery', 'Cơm trưa căn tin'] },
  { categoryName: 'Transport', weight: 0.2, min: 1, max: 8, descriptions: ['Grab to campus', 'Bus pass top-up', 'Xe buýt đến trường'] },
  { categoryName: 'Academics', weight: 0.15, min: 8, max: 60, descriptions: ['Textbook rental', 'Printing lecture notes', 'Stationery supplies'] },
  { categoryName: 'Entertainment', weight: 0.2, min: 5, max: 20, descriptions: ['Cinema tickets', 'Movie night with friends', 'Board game night'] },
  { categoryName: 'Miscellaneous', weight: 0.15, min: 2, max: 18, descriptions: ['Phone case', 'Laundry service', 'Haircut'] },
];

/** Same categories minus Food/Entertainment (those are handled separately for the spike month). */
const BINH_OTHER_PROFILES: readonly ExpenseProfile[] = BINH_BASE_PROFILES.filter((p) => p.categoryName !== 'Food' && p.categoryName !== 'Entertainment');

const BINH_SUBSCRIPTIONS = [
  { name: 'Netflix', amount: '15.49', day: 5 },
  { name: 'Spotify', amount: '9.99', day: 10 },
  { name: 'iCloud+', amount: '2.99', day: 15 },
  { name: 'YouTube Premium', amount: '13.99', day: 20 },
] as const;

/** Generates one "normal" month's transactions (income, rent, all 5 base categories). */
function generateBinhBaseMonth(rng: () => number, month: LocalDate, categories: Map<string, number>): DemoTxn[] {
  const txns: DemoTxn[] = [];

  txns.push({
    categoryId: categoryId(categories, TransactionType.INCOME, 'Part-time Job'),
    type: TransactionType.INCOME,
    amount: randomAmount(rng, 150, 280),
    description: 'Part-time job pay',
    txnDate: dateInMonth(month, randomInt(rng, 1, 10)),
  });

  txns.push({
    categoryId: categoryId(categories, TransactionType.EXPENSE, 'Hostel/Rent'),
    type: TransactionType.EXPENSE,
    amount: randomAmount(rng, 150, 250),
    description: pick(rng, HOSTEL_DESCRIPTIONS),
    txnDate: dateInMonth(month, randomInt(rng, 1, 5)),
  });

  const count = randomInt(rng, 35, 45);
  for (let i = 0; i < count; i += 1) {
    const profile = pickWeighted(rng, BINH_BASE_PROFILES);
    txns.push({
      categoryId: categoryId(categories, TransactionType.EXPENSE, profile.categoryName),
      type: TransactionType.EXPENSE,
      amount: randomAmount(rng, profile.min, profile.max),
      description: pick(rng, profile.descriptions),
      txnDate: dateInMonth(month, randomDayInMonth(rng, month)),
    });
  }

  return txns;
}

/** Generates the spike month: normal income/rent/other categories, but Food +40% / Entertainment +60% vs the trailing 2-month average, spread across several transactions. */
function generateBinhSpikeMonth(rng: () => number, month: LocalDate, categories: Map<string, number>, foodAvg: Decimal, entertainmentAvg: Decimal): DemoTxn[] {
  const txns: DemoTxn[] = [];

  txns.push({
    categoryId: categoryId(categories, TransactionType.INCOME, 'Part-time Job'),
    type: TransactionType.INCOME,
    amount: randomAmount(rng, 150, 280),
    description: 'Part-time job pay',
    txnDate: dateInMonth(month, randomInt(rng, 1, 10)),
  });

  txns.push({
    categoryId: categoryId(categories, TransactionType.EXPENSE, 'Hostel/Rent'),
    type: TransactionType.EXPENSE,
    amount: randomAmount(rng, 150, 250),
    description: pick(rng, HOSTEL_DESCRIPTIONS),
    txnDate: dateInMonth(month, randomInt(rng, 1, 5)),
  });

  const otherCount = randomInt(rng, 20, 26);
  for (let i = 0; i < otherCount; i += 1) {
    const profile = pickWeighted(rng, BINH_OTHER_PROFILES);
    txns.push({
      categoryId: categoryId(categories, TransactionType.EXPENSE, profile.categoryName),
      type: TransactionType.EXPENSE,
      amount: randomAmount(rng, profile.min, profile.max),
      description: pick(rng, profile.descriptions),
      txnDate: dateInMonth(month, randomDayInMonth(rng, month)),
    });
  }

  const foodProfile = BINH_BASE_PROFILES.find((p) => p.categoryName === 'Food') as ExpenseProfile;
  const entertainmentProfile = BINH_BASE_PROFILES.find((p) => p.categoryName === 'Entertainment') as ExpenseProfile;
  const foodId = categoryId(categories, TransactionType.EXPENSE, 'Food');
  const entertainmentId = categoryId(categories, TransactionType.EXPENSE, 'Entertainment');

  for (const amount of splitTotalAcross(rng, foodAvg.times('1.4'), randomInt(rng, 6, 9))) {
    txns.push({ categoryId: foodId, type: TransactionType.EXPENSE, amount, description: pick(rng, foodProfile.descriptions), txnDate: dateInMonth(month, randomDayInMonth(rng, month)) });
  }
  for (const amount of splitTotalAcross(rng, entertainmentAvg.times('1.6'), randomInt(rng, 5, 8))) {
    txns.push({ categoryId: entertainmentId, type: TransactionType.EXPENSE, amount, description: pick(rng, entertainmentProfile.descriptions), txnDate: dateInMonth(month, randomDayInMonth(rng, month)) });
  }

  return txns;
}

/** Seeds `binh.tran@campuscoin.demo`: 3 months, AI off, last-month spike, 4 monthly subscriptions. */
async function seedBinh(prisma: AppPrismaClient, categories: Map<string, number>, studentPasswordHash: string): Promise<number> {
  const email = 'binh.tran@campuscoin.demo';
  const months = trailingMonths(DEMO_ANCHOR_MONTH, 3);
  const [month1, month2, month3] = months as [LocalDate, LocalDate, LocalDate];
  const rng = mulberry32(BINH_RNG_SEED);

  const foodId = categoryId(categories, TransactionType.EXPENSE, 'Food');
  const entertainmentId = categoryId(categories, TransactionType.EXPENSE, 'Entertainment');

  const month1Txns = generateBinhBaseMonth(rng, month1, categories);
  const month2Txns = generateBinhBaseMonth(rng, month2, categories);
  const foodAvg = average([sumForCategory(month1Txns, foodId), sumForCategory(month2Txns, foodId)]);
  const entertainmentAvg = average([sumForCategory(month1Txns, entertainmentId), sumForCategory(month2Txns, entertainmentId)]);
  const month3Txns = generateBinhSpikeMonth(rng, month3, categories, foodAvg, entertainmentAvg);

  const allTxns = [...month1Txns, ...month2Txns, ...month3Txns];

  const userData = {
    passwordHash: studentPasswordHash,
    fullName: 'Trần Thị Bình',
    role: Role.STUDENT,
    status: UserStatus.ACTIVE,
    emailVerifiedAt: new Date(),
    currency: 'USD',
    aiOptIn: false,
  };

  const subscriptionsCategoryId = categoryId(categories, TransactionType.EXPENSE, 'Subscriptions');
  // Started well before the 3-month window so every window month already has an occurrence.
  const startDate = dateInMonth(firstDayOfMonth(addDays(month1, -1)), 1);

  const recurringCount = await prisma.$transaction(async (tx) => {
    const u = await tx.user.upsert({ where: { email }, create: { email, ...userData }, update: userData });
    await wipeUserData(tx, u.id);

    await tx.transaction.createMany({
      data: allTxns.map((t) => ({
        userId: u.id,
        categoryId: t.categoryId,
        type: t.type,
        amount: toMoney(t.amount),
        currency: 'USD',
        description: t.description,
        merchantKey: normalizeMerchantKey(t.description),
        txnDate: toDbDate(t.txnDate),
        source: TransactionSource.MANUAL,
        categorySource: CategorySource.USER,
      })),
    });

    let recurringTxnCount = 0;
    for (const sub of BINH_SUBSCRIPTIONS) {
      const spec: RecurrenceSpec = { frequency: RecurringFrequency.MONTHLY, intervalCount: 1, dayOfMonth: sub.day, dayOfWeek: null, startDate, endDate: null };

      const occurrence1 = occurrenceOnOrAfter(spec, month1) as LocalDate;
      const occurrence2 = nextOccurrenceAfter(spec, occurrence1) as LocalDate;
      const occurrence3 = nextOccurrenceAfter(spec, occurrence2) as LocalDate;
      const nextRunDate = nextOccurrenceAfter(spec, occurrence3) as LocalDate;

      const rule = await tx.recurringRule.create({
        data: {
          userId: u.id,
          categoryId: subscriptionsCategoryId,
          type: TransactionType.EXPENSE,
          amount: toMoney(sub.amount),
          description: `${sub.name} subscription`,
          frequency: RecurringFrequency.MONTHLY,
          intervalCount: 1,
          dayOfMonth: sub.day,
          dayOfWeek: null,
          startDate: toDbDate(startDate),
          nextRunDate: toDbDate(nextRunDate),
          isActive: true,
        },
      });

      await tx.transaction.createMany({
        data: [occurrence1, occurrence2, occurrence3].map((occurrence) => ({
          userId: u.id,
          categoryId: subscriptionsCategoryId,
          type: TransactionType.EXPENSE,
          amount: toMoney(sub.amount),
          currency: 'USD',
          description: `${sub.name} subscription`,
          merchantKey: normalizeMerchantKey(`${sub.name} subscription`),
          txnDate: toDbDate(occurrence),
          source: TransactionSource.RECURRING,
          recurringRuleId: rule.id,
          recurringPeriod: periodKey(RecurringFrequency.MONTHLY, occurrence),
          categorySource: CategorySource.USER,
        })),
      });
      recurringTxnCount += 3;
    }

    return recurringTxnCount;
  });

  return allTxns.length + recurringCount;
}

// ---------------------------------------------------------------------------
// Chi Lê (empty account) & the disabled account
// ---------------------------------------------------------------------------

/** Seeds a student account with no financial data at all (onboarding/CSV-import/disabled-login demos). */
async function seedEmptyStudent(prisma: AppPrismaClient, email: string, fullName: string, status: UserStatus, passwordHash: string): Promise<void> {
  const userData = { passwordHash, fullName, role: Role.STUDENT, status, emailVerifiedAt: new Date() };
  await prisma.$transaction(async (tx) => {
    const u = await tx.user.upsert({ where: { email }, create: { email, ...userData }, update: userData });
    await wipeUserData(tx, u.id);
  });
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

/** Seeds the demo admin (with a fixed, deterministic TOTP secret) and prints its login/MFA info. */
async function seedAdmin(prisma: AppPrismaClient): Promise<void> {
  const passwordHash = await hashPassword(DEMO_ADMIN_PASSWORD);
  const userData = {
    passwordHash,
    fullName: 'Demo Admin',
    role: Role.ADMIN,
    status: UserStatus.ACTIVE,
    emailVerifiedAt: new Date(),
    // `encrypt()` returns a Node `Buffer<ArrayBufferLike>`; Prisma's Bytes input type wants a plain
    // `Uint8Array<ArrayBuffer>` (same TS lib mismatch `admin-auth.repository.ts` also works around).
    mfaSecretEnc: new Uint8Array(encrypt(DEMO_ADMIN_TOTP_SECRET)),
  };
  await prisma.user.upsert({ where: { email: DEMO_ADMIN_EMAIL }, create: { email: DEMO_ADMIN_EMAIL, ...userData }, update: userData });

  const otpauthUrl = buildOtpauthUrl(DEMO_ADMIN_TOTP_SECRET, DEMO_ADMIN_EMAIL);
  const code = await generateTotpCode(DEMO_ADMIN_TOTP_SECRET);
  console.info(`[seed] demo admin: ${DEMO_ADMIN_EMAIL} / ${DEMO_ADMIN_PASSWORD}`);
  console.info(`[seed] demo admin TOTP otpauth URL: ${otpauthUrl}`);
  console.info(`[seed] demo admin TOTP current code (valid ~30s from now): ${code}`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Seeds every demo account and dataset (Bảng 65/69). Requires `seedBase` to have already run
 * (system categories/tip templates must exist). Never run against a production database.
 * @param prisma - Connected Prisma client.
 * @throws Error when `NODE_ENV=production` (demo/test data must never touch production).
 */
export async function seedDemo(prisma: AppPrismaClient): Promise<SeedDemoResult> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seedDemo refuses to run when NODE_ENV=production — demo data must never touch a production database.');
  }

  const categories = await loadSystemCategories(prisma);
  const studentPasswordHash = await hashPassword(DEMO_STUDENT_PASSWORD);

  await seedAdmin(prisma);
  const anTxnCount = await seedAn(prisma, categories, studentPasswordHash);
  const binhTxnCount = await seedBinh(prisma, categories, studentPasswordHash);
  await seedEmptyStudent(prisma, 'chi.le@campuscoin.demo', 'Lê Thị Chi', UserStatus.ACTIVE, studentPasswordHash);
  await seedEmptyStudent(prisma, 'disabled@campuscoin.demo', 'Disabled Demo Account', UserStatus.DISABLED, studentPasswordHash);

  return { usersCreated: 5, transactionsCreated: anTxnCount + binhTxnCount };
}
