/**
 * demo-seed.test.ts
 * Integration test (needs MySQL from `docker compose up -d`) for the P17 demo seed: An's 6 months
 * of data, Bình's engineered last-month Food/Entertainment spike, the disabled account's login
 * rejection, idempotency of a second `seedDemo` run, and the `NODE_ENV=production` guard.
 * Spec: docs/spec/10 §11.5 (Bảng 65) · docs/spec/12 §12.3 (Bảng 69)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { seedBase } from '../../prisma/seed/base.js';
import { seedDemo } from '../../prisma/seed/demo.js';
import { createPrismaClient, type AppPrismaClient } from '../../src/lib/prisma.js';

const AN_EMAIL = 'an.nguyen@campuscoin.demo';
const BINH_EMAIL = 'binh.tran@campuscoin.demo';
const DISABLED_EMAIL = 'disabled@campuscoin.demo';
const DISABLED_PASSWORD = 'Student@Campus2026!';

describe.skipIf(!process.env.DATABASE_URL)('P17 demo seed', () => {
  let prisma: AppPrismaClient;

  beforeAll(async () => {
    prisma = createPrismaClient();
    await seedBase(prisma);
    await seedDemo(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('gives An exactly 5 demo user rows and 6 distinct months of transactions ending at the anchor month', async () => {
    const demoUsers = await prisma.user.findMany({
      where: { email: { in: [AN_EMAIL, BINH_EMAIL, 'chi.le@campuscoin.demo', DISABLED_EMAIL, 'admin@campuscoin.demo'] } },
    });
    expect(demoUsers).toHaveLength(5);

    const an = await prisma.user.findUniqueOrThrow({ where: { email: AN_EMAIL } });
    const txns = await prisma.transaction.findMany({ where: { userId: an.id }, select: { txnDate: true } });
    const months = new Set(txns.map((t) => t.txnDate.toISOString().slice(0, 7)));
    expect(months.size).toBe(6);
    expect([...months].sort()).toContain('2026-09');
  });

  it("Bình's last month Food total is ~40% and Entertainment ~60% above the trailing 2-month average", async () => {
    const binh = await prisma.user.findUniqueOrThrow({ where: { email: BINH_EMAIL } });
    const [food, entertainment] = await Promise.all([
      prisma.category.findFirstOrThrow({ where: { name: 'Food', type: 'expense' } }),
      prisma.category.findFirstOrThrow({ where: { name: 'Entertainment', type: 'expense' } }),
    ]);

    const monthlyTotal = async (categoryId: number, month: string): Promise<number> => {
      const rows = await prisma.transaction.findMany({
        where: { userId: binh.id, categoryId, txnDate: { gte: new Date(`${month}-01T00:00:00Z`), lt: nextMonthStart(month) } },
        select: { amount: true },
      });
      return rows.reduce((s, r) => s + Number(r.amount), 0);
    };

    const [m1Food, m2Food, m3Food, m1Ent, m2Ent, m3Ent] = await Promise.all([
      monthlyTotal(food.id, '2026-07'),
      monthlyTotal(food.id, '2026-08'),
      monthlyTotal(food.id, '2026-09'),
      monthlyTotal(entertainment.id, '2026-07'),
      monthlyTotal(entertainment.id, '2026-08'),
      monthlyTotal(entertainment.id, '2026-09'),
    ]);

    const foodAvg = (m1Food + m2Food) / 2;
    const entAvg = (m1Ent + m2Ent) / 2;
    const foodGrowthPct = ((m3Food - foodAvg) / foodAvg) * 100;
    const entGrowthPct = ((m3Ent - entAvg) / entAvg) * 100;

    expect(foodGrowthPct).toBeGreaterThanOrEqual(35);
    expect(foodGrowthPct).toBeLessThanOrEqual(45);
    expect(entGrowthPct).toBeGreaterThanOrEqual(55);
    expect(entGrowthPct).toBeLessThanOrEqual(65);
  });

  it('Bình has exactly 4 active monthly recurring subscription rules with 3 generated occurrences each', async () => {
    const binh = await prisma.user.findUniqueOrThrow({ where: { email: BINH_EMAIL } });
    const rules = await prisma.recurringRule.findMany({ where: { userId: binh.id } });
    expect(rules).toHaveLength(4);
    expect(rules.every((r) => r.isActive)).toBe(true);

    for (const rule of rules) {
      const count = await prisma.transaction.count({ where: { recurringRuleId: rule.id } });
      expect(count).toBe(3);
    }
  });

  it('disabled@campuscoin.demo cannot log in (403 account-disabled)', async () => {
    const { createApp } = await import('../../src/app.js');
    const app = createApp();

    const res = await request(app).post('/api/v1/auth/login').send({ email: DISABLED_EMAIL, password: DISABLED_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.type).toBe('account-disabled');
  });

  it('a second seedDemo run does not duplicate users or transactions', async () => {
    const an = await prisma.user.findUniqueOrThrow({ where: { email: AN_EMAIL } });
    const beforeTxnCount = await prisma.transaction.count({ where: { userId: an.id } });
    const beforeUserCount = await prisma.user.count({ where: { email: AN_EMAIL } });

    await seedDemo(prisma);

    const afterTxnCount = await prisma.transaction.count({ where: { userId: an.id } });
    const afterUserCount = await prisma.user.count({ where: { email: AN_EMAIL } });

    expect(afterUserCount).toBe(beforeUserCount);
    expect(afterUserCount).toBe(1);
    expect(afterTxnCount).toBe(beforeTxnCount);
  });

  it('refuses to run when NODE_ENV=production', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(seedDemo(prisma)).rejects.toThrow(/NODE_ENV=production/);
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});

/** UTC start of the month after `month` (`YYYY-MM`), for an exclusive upper date bound. */
function nextMonthStart(month: string): Date {
  const [year, mon] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(mon === 12 ? year + 1 : year, mon === 12 ? 0 : mon, 1));
}
