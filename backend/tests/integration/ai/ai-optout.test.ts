/**
 * ai-optout.test.ts
 * Integration test proving docs/spec/09 §9.14 ("tắt ai_opt_in có hiệu lực ngay"): once a user's
 * `aiOptIn` is flipped to `false` (via `PATCH /me`), EVERY provider call path — `ai.service.suggest`,
 * `ai.service.suggestBatch`, and `insights.generate.generateForUser` — must never reach the (spy)
 * provider again, and a freshly generated insight must fall back to the deterministic template.
 * Spec: docs/spec/09 §9.14 · docs/spec/05b §5.6, §5.9
 */
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { AiProvider, CategorizeRequest, CategorizeResultItem } from '../../../src/integrations/ai/index.js';

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { redis } = await import('../../../src/lib/redis.js');
const { createActiveUser, cleanupTestUsers } = await import('../../fixtures/auth.js');
const { _setAiProviderForTests } = await import('../../../src/integrations/ai/index.js');
const aiService = await import('../../../src/modules/ai/ai.service.js');
const { generateForUser } = await import('../../../src/modules/insights/insights.generate.js');
const { usersRepository } = await import('../../../src/modules/users/users.repository.js');

/** Letters-only random word — `normalizeMerchantKey` strips digits, so a UUID would collide with itself. */
function uniqueWord(): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let out = '';
  for (let i = 0; i < 16; i++) out += letters[Math.floor(Math.random() * letters.length)];
  return out;
}

/** Installs an always-answering spy provider and returns its two capability mocks. */
function installSpyProvider() {
  const categorize = vi.fn(async (req: CategorizeRequest): Promise<CategorizeResultItem[]> =>
    req.items.map((item) => ({ index: item.index, category: 'Miscellaneous', confidence: 0.9 })),
  );
  const writeInsight = vi.fn(async () => ({ summaryText: 'LLM summary', tipText: 'LLM tip' }));
  const provider: AiProvider = { name: 'spy', enabled: true, categorize, writeInsight };
  _setAiProviderForTests(provider);
  return { categorize, writeInsight };
}

describe.skipIf(!process.env.DATABASE_URL)('AI opt-out takes effect immediately (§9.14)', () => {
  const app = createApp();

  afterEach(async () => {
    _setAiProviderForTests(null);
    await cleanupTestUsers();
    const keys = await redis.keys('ai:*');
    if (keys.length > 0) await redis.del(...keys);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('suggest(): opted-in then opted-out mid-session never calls the spy after PATCH /me', async () => {
    const user = await createActiveUser();
    await prisma.user.update({ where: { id: user.id }, data: { aiOptIn: true } });
    const login = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: user.password });
    const accessToken = login.body.accessToken as string;

    const { categorize } = installSpyProvider();

    // Opt out via PATCH /me — must take effect on the very next call.
    const patch = await request(app).patch('/api/v1/me').set('Authorization', `Bearer ${accessToken}`).send({ aiOptIn: false });
    expect(patch.status).toBe(200);
    expect(patch.body.aiOptIn).toBe(false);

    const result = await aiService.suggest(user.id, { description: uniqueWord(), type: 'expense' });
    expect(result).toBeNull();
    expect(categorize).not.toHaveBeenCalled();
  });

  it('suggest(): a DISABLED account (aiOptIn still true) never reaches the spy (Fix 4: opt-in check must also require status=active)', async () => {
    const user = await createActiveUser();
    // Simulates `DELETE /me`: disables the account WITHOUT touching `aiOptIn`.
    await prisma.user.update({ where: { id: user.id }, data: { aiOptIn: true, status: 'disabled' } });

    const { categorize } = installSpyProvider();

    const result = await aiService.suggest(user.id, { description: uniqueWord(), type: 'expense' });

    expect(result).toBeNull();
    expect(categorize).not.toHaveBeenCalled();
  });

  it('suggestBatch(): a DISABLED account (aiOptIn still true) never reaches the spy for any chunk (Fix 4)', async () => {
    const user = await createActiveUser();
    await prisma.user.update({ where: { id: user.id }, data: { aiOptIn: true, status: 'disabled' } });

    const { categorize } = installSpyProvider();

    const items = Array.from({ length: 5 }, () => ({ description: uniqueWord(), type: 'expense' as const }));
    const results = await aiService.suggestBatch(user.id, items);

    expect(results.every((r) => r === null)).toBe(true);
    expect(categorize).not.toHaveBeenCalled();
  });

  it('suggestBatch(): an already opted-out user never reaches the spy for any chunk', async () => {
    const user = await createActiveUser();
    await prisma.user.update({ where: { id: user.id }, data: { aiOptIn: false } });

    const { categorize } = installSpyProvider();

    const items = Array.from({ length: 5 }, () => ({ description: uniqueWord(), type: 'expense' as const }));
    const results = await aiService.suggestBatch(user.id, items);

    expect(results.every((r) => r === null)).toBe(true);
    expect(categorize).not.toHaveBeenCalled();
  });

  it('generateForUser(): a job queued before an opt-out falls back to the template and never calls the spy', async () => {
    const user = await createActiveUser();
    await prisma.user.update({ where: { id: user.id }, data: { aiOptIn: true } });
    // Opt out before the job actually runs (simulates "queued before an opt-out").
    await prisma.user.update({ where: { id: user.id }, data: { aiOptIn: false } });

    const { writeInsight } = installSpyProvider();
    const month = '2020-01-01'; // a fixed past month, never collides with "current month" guards.

    await generateForUser(user.id, month);

    expect(writeInsight).not.toHaveBeenCalled();
    const row = await prisma.insight.findUniqueOrThrow({ where: { userId_month: { userId: user.id, month: new Date('2020-01-01') } } });
    expect(row.generator).toBe('template');
  });

  it('generateForUser(): an opt-out that happens AFTER the initial aggregate reads (but before the LLM call) still falls back to the template (Fix 5)', async () => {
    const user = await createActiveUser();
    await prisma.user.update({ where: { id: user.id }, data: { aiOptIn: true } });

    const { writeInsight } = installSpyProvider();
    const month = '2020-03-01'; // distinct from the other tests' fixed months.

    // The gate at the top of `generateForUser` reads the user once (still opted in); the fresh
    // pre-LLM re-check (Fix 5, via `ai.service.ts`'s `isAiOptedIn`) reads it again right before the
    // LLM call — simulate a mid-flight opt-out landing exactly in between the two reads.
    let callCount = 0;
    const original = usersRepository.findById.bind(usersRepository);
    // Cast needed: Prisma's real `findById` returns a fluent `Prisma__UserClient` thenable (extra
    // relation-loading methods this mock never needs), not a plain `Promise` — `isAiOptedIn` only
    // ever awaits the result.
    const mockFindById = (async (userId: string) => {
      callCount += 1;
      const row = await original(userId);
      if (!row) return row;
      // 1st call = the top-of-function read (still opted in); every subsequent call (the fresh
      // re-check inside `isAiOptedIn`) reflects the "just opted out mid-flight" state.
      return callCount === 1 ? row : { ...row, aiOptIn: false };
    }) as unknown as typeof usersRepository.findById;
    const spy = vi.spyOn(usersRepository, 'findById').mockImplementation(mockFindById);

    try {
      await generateForUser(user.id, month);
    } finally {
      spy.mockRestore();
    }

    expect(writeInsight).not.toHaveBeenCalled();
    const row = await prisma.insight.findUniqueOrThrow({ where: { userId_month: { userId: user.id, month: new Date('2020-03-01') } } });
    expect(row.generator).toBe('template');
  });
});
