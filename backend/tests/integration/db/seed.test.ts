/**
 * seed.test.ts
 * DB integration test (needs MySQL from `docker compose up -d` + applied migrations):
 * - the base seed is idempotent and creates exactly 12 default categories,
 * - the hand-written CHECK constraint rejects a non-positive transaction amount.
 * Skipped when DATABASE_URL is not set (e.g. CI without MySQL).
 * Spec: docs/spec/06 §6.3, §6.5 · docs/spec/12 (testing plan)
 */
import { randomUUID } from 'node:crypto';
import { SYSTEM_OWNER_KEY } from '@campuscoin/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedBase } from '../../../prisma/seed/base.js';
import { createPrismaClient, type AppPrismaClient } from '../../../src/lib/prisma.js';

describe.skipIf(!process.env.DATABASE_URL)('database schema & base seed', () => {
  let prisma: AppPrismaClient;

  beforeAll(() => {
    prisma = createPrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('seeds 12 default categories and is idempotent', async () => {
    await seedBase(prisma);
    await seedBase(prisma);

    const defaults = await prisma.category.findMany({ where: { ownerKey: SYSTEM_OWNER_KEY } });
    expect(defaults).toHaveLength(12);
    expect(defaults.filter((c) => c.type === 'income')).toHaveLength(5);
    expect(defaults.filter((c) => c.type === 'expense')).toHaveLength(7);
    expect(defaults.every((c) => c.isDefault && c.userId === null)).toBe(true);
    expect(await prisma.tipTemplate.count({ where: { code: { startsWith: 'R' } } })).toBe(15);
  });

  it('CHECK constraint rejects amount <= 0 on transactions', async () => {
    await seedBase(prisma);
    const category = await prisma.category.findFirstOrThrow({
      where: { ownerKey: SYSTEM_OWNER_KEY, type: 'expense', name: 'Food' },
    });
    const user = await prisma.user.create({
      data: {
        email: `check-test-${randomUUID()}@example.test`,
        passwordHash: 'not-a-real-hash',
        fullName: 'Check Constraint Test',
      },
    });

    try {
      const insert = (amount: string) =>
        prisma.$executeRaw`INSERT INTO transactions (id, user_id, category_id, type, amount, currency, txn_date, updated_at)
          VALUES (${randomUUID()}, ${user.id}, ${category.id}, 'expense', ${amount}, 'USD', '2026-09-26', NOW(3))`;

      await expect(insert('-5.00')).rejects.toThrow(/chk_transactions_amount_positive/);
      await expect(insert('0.00')).rejects.toThrow(/chk_transactions_amount_positive/);
      await expect(insert('5.00')).resolves.toBe(1);
    } finally {
      // Transactions RESTRICT user deletion, so remove them first.
      await prisma.transaction.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});
