/**
 * categories.repository.test.ts
 * Integration tests for `categoriesRepository`'s ownership-scoped methods against real MySQL
 * (skipped without DATABASE_URL). Proves B-M1 directly at the repository layer: calling
 * `updateOwned`/`deleteOwned`/`updateDefault`/`deleteDefault` with the wrong scope affects nothing
 * (a 0-count `updateMany`/`deleteMany`), not another user's/a default's row.
 * Spec: docs/spec/05a §5.3 · Rules: BR-CA-01..05
 */
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { SYSTEM_OWNER_KEY } from '@campuscoin/shared';
import { prisma } from '../../../src/lib/prisma.js';
import { createActiveUser, cleanupTestUsers } from '../../fixtures/auth.js';
import { categoriesRepository } from '../../../src/modules/categories/categories.repository.js';

describe.skipIf(!process.env.DATABASE_URL)('categoriesRepository ownership scoping (B-M1)', () => {
  afterEach(async () => {
    await cleanupTestUsers();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('updateOwned with the wrong userId affects nothing (null, not the row updated)', async () => {
    const owner = await createActiveUser();
    const stranger = await createActiveUser();
    const category = await categoriesRepository.create({ userId: owner.id, ownerKey: owner.id, name: 'Mine', type: 'expense' });

    const result = await categoriesRepository.updateOwned(category.id, stranger.id, { name: 'Stolen' });

    expect(result).toBeNull();
    const stillOwners = await prisma.category.findUnique({ where: { id: category.id } });
    expect(stillOwners?.name).toBe('Mine');
  });

  it('deleteOwned with the wrong userId affects nothing (count 0, row survives)', async () => {
    const owner = await createActiveUser();
    const stranger = await createActiveUser();
    const category = await categoriesRepository.create({ userId: owner.id, ownerKey: owner.id, name: 'Mine', type: 'expense' });

    const result = await categoriesRepository.deleteOwned(category.id, stranger.id);

    expect(result.count).toBe(0);
    expect(await prisma.category.findUnique({ where: { id: category.id } })).not.toBeNull();
  });

  it('updateOwned/deleteOwned can never touch a system-default category, even for its "owner" (SYSTEM_OWNER_KEY is not a real userId)', async () => {
    const defaultCategory = await prisma.category.findFirstOrThrow({ where: { isDefault: true, type: 'expense' } });

    const updateResult = await categoriesRepository.updateOwned(defaultCategory.id, SYSTEM_OWNER_KEY, { name: 'Hacked' });
    expect(updateResult).toBeNull();

    const deleteResult = await categoriesRepository.deleteOwned(defaultCategory.id, SYSTEM_OWNER_KEY);
    expect(deleteResult.count).toBe(0);

    const stillThere = await prisma.category.findUnique({ where: { id: defaultCategory.id } });
    expect(stillThere).not.toBeNull();
    expect(stillThere?.name).not.toBe('Hacked');
  });

  it('updateDefault/deleteDefault never touch a personal category', async () => {
    const owner = await createActiveUser();
    const category = await categoriesRepository.create({ userId: owner.id, ownerKey: owner.id, name: 'Personal Only', type: 'expense' });

    const updateResult = await categoriesRepository.updateDefault(category.id, { name: 'Hacked' });
    expect(updateResult).toBeNull();

    const deleteResult = await categoriesRepository.deleteDefault(category.id);
    expect(deleteResult.count).toBe(0);

    const stillThere = await prisma.category.findUnique({ where: { id: category.id } });
    expect(stillThere?.name).toBe('Personal Only');
  });

  it('usage({ userId }) only counts that user\'s own rows, never another user\'s use of the same default category', async () => {
    const userA = await createActiveUser();
    const userB = await createActiveUser();
    const food = await prisma.category.findFirstOrThrow({ where: { isDefault: true, type: 'expense', name: 'Food' } });

    await prisma.transaction.create({
      data: { userId: userA.id, categoryId: food.id, type: 'expense', amount: '5.00', currency: 'USD', description: 'A', txnDate: new Date('2024-01-01'), source: 'manual', categorySource: 'user' },
    });
    await prisma.transaction.create({
      data: { userId: userB.id, categoryId: food.id, type: 'expense', amount: '7.00', currency: 'USD', description: 'B', txnDate: new Date('2024-01-01'), source: 'manual', categorySource: 'user' },
    });

    const usageForA = await categoriesRepository.usage(food.id, { userId: userA.id });
    expect(usageForA.transactions).toBe(1);

    const usageForAdmin = await categoriesRepository.usage(food.id, { admin: true });
    expect(usageForAdmin.transactions).toBeGreaterThanOrEqual(2);
  });
});
