/**
 * recurring.repository.test.ts
 * Integration tests for `recurringRepository`'s ownership-scoped methods against real MySQL
 * (skipped without DATABASE_URL). Proves B-M1 directly at the repository layer: calling
 * `updateOwned`/`deleteOwned` with the wrong `userId` affects nothing (a 0-count
 * `updateMany`/`deleteMany`), not another user's rule.
 * Spec: docs/spec/05a §5.4.2 (recurring transactions)
 */
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { prisma } from '../../../src/lib/prisma.js';
import { toDbDate, todayInTimeZone } from '../../../src/lib/dates.js';
import { toMoney } from '../../../src/lib/money.js';
import { createActiveUser, cleanupTestUsers } from '../../fixtures/auth.js';
import { recurringRepository } from '../../../src/modules/recurring/recurring.repository.js';

describe.skipIf(!process.env.DATABASE_URL)('recurringRepository ownership scoping (B-M1)', () => {
  afterEach(async () => {
    await cleanupTestUsers();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Creates a rule owned by `userId` for a default expense category. */
  async function createRule(userId: string) {
    const category = await prisma.category.findFirstOrThrow({ where: { isDefault: true, type: 'expense' } });
    const today = toDbDate(todayInTimeZone('Asia/Ho_Chi_Minh'));
    return recurringRepository.create({
      userId,
      categoryId: category.id,
      type: 'expense',
      amount: toMoney('9.99'),
      description: 'Mine',
      frequency: 'monthly',
      intervalCount: 1,
      dayOfMonth: 15,
      dayOfWeek: null,
      startDate: today,
      endDate: null,
      nextRunDate: today,
    });
  }

  it('updateOwned with the wrong userId affects nothing (null, not the row updated)', async () => {
    const owner = await createActiveUser();
    const stranger = await createActiveUser();
    const rule = await createRule(owner.id);

    const result = await recurringRepository.updateOwned(rule.id, stranger.id, { description: 'Stolen' });

    expect(result).toBeNull();
    const stillOwners = await prisma.recurringRule.findUnique({ where: { id: rule.id } });
    expect(stillOwners?.description).toBe('Mine');
  });

  it('deleteOwned with the wrong userId affects nothing (count 0, row survives)', async () => {
    const owner = await createActiveUser();
    const stranger = await createActiveUser();
    const rule = await createRule(owner.id);

    const result = await recurringRepository.deleteOwned(rule.id, stranger.id);

    expect(result.count).toBe(0);
    expect(await prisma.recurringRule.findUnique({ where: { id: rule.id } })).not.toBeNull();
  });

  it('updateOwned/deleteOwned succeed for the real owner', async () => {
    const owner = await createActiveUser();
    const rule = await createRule(owner.id);

    const updated = await recurringRepository.updateOwned(rule.id, owner.id, { description: 'Renamed' });
    expect(updated?.description).toBe('Renamed');

    const deleted = await recurringRepository.deleteOwned(rule.id, owner.id);
    expect(deleted.count).toBe(1);
    expect(await prisma.recurringRule.findUnique({ where: { id: rule.id } })).toBeNull();
  });
});
