/**
 * recurring-materialize.test.ts
 * Integration tests for the `recurring.materialize` job
 * (backend/src/jobs/processors/recurring-materialize.processor.ts) against real MySQL + Redis
 * (skipped without DATABASE_URL). Covers catch-up capped at RECURRING_CATCHUP_MAX, TC-14
 * idempotency (re-running the same backlog creates no duplicates), `nextRunDate` advancing past
 * "today", and a rule past its `endDate` being deactivated.
 * Spec: docs/spec/04 §4.5 (Table 13 – recurring.materialize) · docs/spec/05a §5.4.2
 */
import { afterAll, afterEach, describe, expect, it } from 'vitest';

const { prisma } = await import('../../../src/lib/prisma.js');
const { createActiveUser, cleanupTestUsers } = await import('../../fixtures/auth.js');
const { materializeDueRules } = await import('../../../src/jobs/processors/recurring-materialize.processor.js');
const { addDays, firstDayOfMonth, toDbDate, todayInTimeZone } = await import('../../../src/lib/dates.js');
const { RECURRING_CATCHUP_MAX, DEFAULT_TIMEZONE } = await import('@campuscoin/shared');
const { on: onEvent, _resetForTests: resetEventBus } = await import('../../../src/events/bus.js');
const { registerCacheInvalidatorHandler } = await import('../../../src/events/handlers/cache-invalidator.handler.js');
const { cacheGet, cacheSet } = await import('../../../src/lib/cache.js');
const { dashboardKey } = await import('../../../src/lib/cacheKeys.js');

describe.skipIf(!process.env.DATABASE_URL)('recurring.materialize job', () => {
  afterEach(async () => {
    resetEventBus();
    await cleanupTestUsers();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function getDefaultCategory(type: 'income' | 'expense') {
    return prisma.category.findFirstOrThrow({ where: { isDefault: true, type } });
  }

  it('catches up missed periods capped at RECURRING_CATCHUP_MAX, is idempotent on the same backlog, and advances nextRunDate past today', async () => {
    const user = await createActiveUser();
    const category = await getDefaultCategory('expense');
    const now = new Date();
    const today = todayInTimeZone(DEFAULT_TIMEZONE, now);
    const staleNextRunDate = toDbDate('2015-02-15'); // far more than RECURRING_CATCHUP_MAX months behind "now"

    const rule = await prisma.recurringRule.create({
      data: {
        userId: user.id,
        categoryId: category.id,
        type: 'expense',
        amount: '9.99',
        description: 'Streaming subscription',
        frequency: 'monthly',
        intervalCount: 1,
        dayOfMonth: 15,
        startDate: toDbDate('2015-01-15'),
        nextRunDate: staleNextRunDate,
        isActive: true,
      },
    });

    const firstRun = await materializeDueRules(now);
    expect(firstRun.failed).toBe(0);

    const txnsAfterFirstRun = await prisma.transaction.findMany({ where: { recurringRuleId: rule.id }, orderBy: { txnDate: 'asc' } });
    expect(txnsAfterFirstRun).toHaveLength(RECURRING_CATCHUP_MAX);
    // Every materialized period is on/before today, and each is `source: 'recurring'`.
    for (const txn of txnsAfterFirstRun) {
      expect(txn.txnDate.toISOString().slice(0, 10) <= today).toBe(true);
      expect(txn.source).toBe('recurring');
    }

    const afterFirstRun = await prisma.recurringRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(afterFirstRun.nextRunDate.toISOString().slice(0, 10) > today).toBe(true);
    expect(afterFirstRun.isActive).toBe(true);

    // TC-14: reset nextRunDate back to the same stale backlog and re-run — every period in the
    // window already exists, so createSystemTransaction's P2002 swallow must produce zero new rows.
    await prisma.recurringRule.update({ where: { id: rule.id }, data: { nextRunDate: staleNextRunDate, isActive: true } });

    const secondRun = await materializeDueRules(now);
    expect(secondRun.failed).toBe(0);
    expect(secondRun.created).toBe(0);
    expect(secondRun.skipped).toBeGreaterThan(0);

    const txnsAfterSecondRun = await prisma.transaction.findMany({ where: { recurringRuleId: rule.id } });
    expect(txnsAfterSecondRun).toHaveLength(RECURRING_CATCHUP_MAX);
  }, 30_000);

  it('deactivates a rule once its last occurrence is past endDate', async () => {
    const user = await createActiveUser();
    const category = await getDefaultCategory('expense');
    const now = new Date();

    const rule = await prisma.recurringRule.create({
      data: {
        userId: user.id,
        categoryId: category.id,
        type: 'expense',
        amount: '5.00',
        description: 'Short-lived plan',
        frequency: 'monthly',
        intervalCount: 1,
        dayOfMonth: 10,
        startDate: toDbDate('2020-01-10'),
        endDate: toDbDate('2020-06-10'),
        nextRunDate: toDbDate('2020-01-10'),
        isActive: true,
      },
    });

    const result = await materializeDueRules(now);
    expect(result.failed).toBe(0);
    expect(result.deactivated).toBeGreaterThanOrEqual(1);

    const txns = await prisma.transaction.findMany({ where: { recurringRuleId: rule.id }, orderBy: { txnDate: 'asc' } });
    expect(txns).toHaveLength(6); // Jan..Jun 2020, one per month, well under the catch-up cap.
    expect(txns[txns.length - 1]!.txnDate.toISOString().slice(0, 10)).toBe('2020-06-10');

    const after = await prisma.recurringRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(after.isActive).toBe(false);
    expect(after.nextRunDate.toISOString().slice(0, 10)).toBe('2020-06-10');
  }, 30_000);

  it('a rule not yet due (nextRunDate in the future) is left untouched', async () => {
    const user = await createActiveUser();
    const category = await getDefaultCategory('expense');
    const now = new Date();
    // `nextRunDate` is a `@db.Date` column (no time-of-day) — build it the same way production
    // code does (toDbDate on a local date string), so the round-tripped value compares equal.
    const future = toDbDate(addDays(todayInTimeZone(DEFAULT_TIMEZONE, now), 60)); // ~2 months ahead

    const rule = await prisma.recurringRule.create({
      data: {
        userId: user.id,
        categoryId: category.id,
        type: 'expense',
        amount: '5.00',
        frequency: 'monthly',
        intervalCount: 1,
        dayOfMonth: 10,
        startDate: toDbDate('2026-01-10'),
        nextRunDate: future,
        isActive: true,
      },
    });

    const result = await materializeDueRules(now);
    expect(result.failed).toBe(0);

    const txns = await prisma.transaction.findMany({ where: { recurringRuleId: rule.id } });
    expect(txns).toHaveLength(0);

    const after = await prisma.recurringRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(after.nextRunDate.getTime()).toBe(future.getTime());
    expect(after.isActive).toBe(true);
  });

  it('a job-created transaction emits transaction.created, and the cache-invalidator handler clears that month\'s cached dashboard', async () => {
    registerCacheInvalidatorHandler();
    const user = await createActiveUser();
    const category = await getDefaultCategory('expense');
    const now = new Date();
    const today = todayInTimeZone(DEFAULT_TIMEZONE, now);
    const month = firstDayOfMonth(today);

    const rule = await prisma.recurringRule.create({
      data: {
        userId: user.id,
        categoryId: category.id,
        type: 'expense',
        amount: '9.99',
        frequency: 'monthly',
        intervalCount: 1,
        dayOfMonth: Number(today.slice(8, 10)),
        startDate: toDbDate(today),
        nextRunDate: toDbDate(today),
        isActive: true,
      },
    });
    expect(rule).toBeDefined();

    await cacheSet(dashboardKey(user.id, month), { seeded: true }, 60);

    let createdFired = false;
    onEvent('transaction.created', () => {
      createdFired = true;
    });

    const result = await materializeDueRules(now);
    expect(result.failed).toBe(0);

    // emitAfterCommit fires on setImmediate; the cache-invalidator handler is itself async too.
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(createdFired).toBe(true);
    expect(await cacheGet(dashboardKey(user.id, month))).toBeUndefined();
  }, 30_000);

  it('advance() is conditional on the original nextRunDate: a second call with a now-stale value is a no-op (fix for concurrent pause/edit)', async () => {
    const { recurringRepository } = await import('../../../src/modules/recurring/recurring.repository.js');
    const user = await createActiveUser();
    const category = await getDefaultCategory('expense');

    const rule = await prisma.recurringRule.create({
      data: {
        userId: user.id,
        categoryId: category.id,
        type: 'expense',
        amount: '9.99',
        frequency: 'monthly',
        intervalCount: 1,
        dayOfMonth: 15,
        startDate: toDbDate('2026-01-15'),
        nextRunDate: toDbDate('2026-01-15'),
        isActive: true,
      },
    });
    const originalNextRunDate = rule.nextRunDate;

    // Simulate the processor's own first advance (the happy path): matches, so it succeeds.
    const first = await recurringRepository.advance(rule.id, originalNextRunDate, toDbDate('2026-02-15'), toDbDate('2026-01-15'), true);
    expect(first.count).toBe(1);

    // Now simulate a second call still holding the STALE original nextRunDate it read before the
    // first call ran (e.g. a concurrent user edit/pause raced the job) — must be a no-op.
    const second = await recurringRepository.advance(rule.id, originalNextRunDate, toDbDate('2026-03-15'), toDbDate('2026-02-15'), true);
    expect(second.count).toBe(0);

    const after = await prisma.recurringRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(after.nextRunDate.toISOString().slice(0, 10)).toBe('2026-02-15'); // unchanged by the no-op second call
  });
});
