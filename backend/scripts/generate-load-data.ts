/**
 * generate-load-data.ts
 * !!! WARNING — MANUAL, DESTRUCTIVE, NOT PART OF ANY NPM SCRIPT !!!
 * Standalone load/performance-testing data generator: inserts 5,000 synthetic users x 12 months x
 * 80 transactions each (~4.8M transaction rows) directly into whatever database DATABASE_URL points
 * at. This is NOT run by `npm run db:seed` and is never invoked automatically — run it deliberately,
 * NEVER against a shared/production database:
 *   npx tsx --env-file-if-exists=../.env backend/scripts/generate-load-data.ts   (from repo root)
 *   npx tsx --env-file-if-exists=.env scripts/generate-load-data.ts              (from backend/)
 * No automated tests: a quick manual sanity check is to temporarily shrink USER_COUNT/MONTHS_PER_USER/
 * TXNS_PER_MONTH_PER_USER to something tiny (e.g. 5/1/10), confirm it runs without crashing, then
 * restore the real constants before finishing.
 * Main exports: none (CLI entry point)
 * Spec: docs/spec/10 §11.5 · docs/spec/12 §12.3 (Bảng 69 – load test dataset)
 */
import { randomUUID } from 'node:crypto';
import { SYSTEM_OWNER_KEY, TransactionType } from '@campuscoin/shared';
import { mulberry32, pick, randomAmount, randomInt } from '../prisma/seed/rng.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import { toDbDate, trailingMonths, type LocalDate } from '../src/lib/dates.js';
import { hashPassword } from '../src/lib/password.js';
import { createPrismaClient } from '../src/lib/prisma.js';

/** Number of synthetic users to create. */
const USER_COUNT = 5000;
/** Trailing months of data per user. */
const MONTHS_PER_USER = 12;
/** Transactions per user per month. */
const TXNS_PER_MONTH_PER_USER = 80;
/** Row batch size for every `createMany` call (MySQL-friendly chunk size). */
const BATCH_SIZE = 5000;
/** Print a progress line every this many flushed batches. */
const PROGRESS_EVERY_BATCHES = 50;

/** Fixed seed so the generated data is reproducible across runs (same helper as the demo seed). */
const LOAD_SEED = 90210;

/** Anchor month for the 12-month window — "now", truncated to the first of the month (a load-test dataset does not need the demo seed's cross-run reproducibility of *dates*, only of amounts). */
function currentAnchorMonth(): LocalDate {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/** Minimal category reference cached once, never re-queried per transaction. */
interface CategoryRef {
  id: number;
  type: TransactionType;
}

async function main(): Promise<void> {
  console.warn('[generate-load-data] About to insert ~%d transaction rows for %d users.', USER_COUNT * MONTHS_PER_USER * TXNS_PER_MONTH_PER_USER, USER_COUNT);
  console.warn('[generate-load-data] NEVER run this against a shared/production database.');

  const prisma = createPrismaClient();
  const rng = mulberry32(LOAD_SEED);

  try {
    // Hashed once (never logged into), reused for every user — hashing 5000x would dominate runtime.
    const passwordHash = await hashPassword('not-a-real-password-load-test-only');

    const categoryRows = await prisma.category.findMany({ where: { ownerKey: SYSTEM_OWNER_KEY }, select: { id: true, type: true } });
    const categories: CategoryRef[] = categoryRows.map((c) => ({ id: c.id, type: c.type as TransactionType }));
    if (categories.length === 0) throw new Error('No system categories found — run `npm run db:seed -w backend` first.');
    const incomeCategories = categories.filter((c) => c.type === TransactionType.INCOME);
    const expenseCategories = categories.filter((c) => c.type === TransactionType.EXPENSE);

    console.info('[generate-load-data] Creating %d users...', USER_COUNT);
    const userIds: string[] = [];
    for (let i = 0; i < USER_COUNT; i += 1) userIds.push(randomUUID());
    for (let start = 0; start < USER_COUNT; start += BATCH_SIZE) {
      const batchIds = userIds.slice(start, start + BATCH_SIZE);
      await prisma.user.createMany({
        data: batchIds.map((id, idx) => ({
          id,
          email: `load-test-user-${start + idx}@campuscoin.load`,
          passwordHash,
          fullName: `Load Test User ${start + idx}`,
          status: 'active',
          emailVerifiedAt: new Date(),
        })),
      });
    }
    console.info('[generate-load-data] %d users created.', USER_COUNT);

    const months = trailingMonths(currentAnchorMonth(), MONTHS_PER_USER);
    const totalTxns = USER_COUNT * MONTHS_PER_USER * TXNS_PER_MONTH_PER_USER;
    let buffer: Prisma.TransactionCreateManyInput[] = [];
    let insertedTotal = 0;
    let batchesSinceLog = 0;

    const flush = async (): Promise<void> => {
      if (buffer.length === 0) return;
      await prisma.transaction.createMany({ data: buffer });
      insertedTotal += buffer.length;
      buffer = [];
      batchesSinceLog += 1;
      if (batchesSinceLog >= PROGRESS_EVERY_BATCHES) {
        console.info('[generate-load-data] Inserted %d / %d transactions...', insertedTotal, totalTxns);
        batchesSinceLog = 0;
      }
    };

    for (const userId of userIds) {
      for (const month of months) {
        for (let i = 0; i < TXNS_PER_MONTH_PER_USER; i += 1) {
          const isIncome = rng() < 0.15;
          const category = pick(rng, isIncome ? incomeCategories : expenseCategories);
          buffer.push({
            id: randomUUID(),
            userId,
            categoryId: category.id,
            type: category.type,
            amount: randomAmount(rng, isIncome ? 50 : 2, isIncome ? 400 : 100),
            currency: 'USD',
            description: null,
            txnDate: toDbDate(`${month.slice(0, 8)}${String(randomInt(rng, 1, 28)).padStart(2, '0')}`),
            source: 'manual',
            categorySource: 'user',
          });
          if (buffer.length >= BATCH_SIZE) await flush();
        }
      }
    }
    await flush();

    console.info('[generate-load-data] Done: %d users, %d transactions.', USER_COUNT, insertedTotal);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('[generate-load-data] failed', err);
  process.exitCode = 1;
});
