/**
 * ai-learning.test.ts
 * Integration tests for TC-16 (AI-learning domain-event handler) against real MySQL + Redis
 * (skipped without DATABASE_URL): overriding an AI suggestion teaches a tier-1 rule, accepting a
 * rule-backed suggestion reinforces it to strong confidence, two consecutive corrections replace
 * the rule outright (with an accept in between correctly clearing the pending state), recurring-
 * source transactions are never learned from, replaying the same event never double-counts, and a
 * plain `PATCH` category change also learns.
 * Spec: docs/spec/04 §4.6 · docs/spec/05b §5.6 (AI categorization, tier 1) · TC-16
 */
import { randomUUID } from 'node:crypto';
import { AI_RULE_REPLACE_AFTER, AI_RULE_STRONG_MIN_HITS } from '@campuscoin/shared';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { redis } = await import('../../../src/lib/redis.js');
const { createActiveUser, cleanupTestUsers, flushRateLimits } = await import('../../fixtures/auth.js');
const { _resetForTests: resetEventBus } = await import('../../../src/events/bus.js');
const { registerAiLearningHandler, handleAiLearning } = await import('../../../src/events/handlers/ai-learning.handler.js');
const { aiRulesRepository } = await import('../../../src/modules/ai/ai.repository.js');

/** Polls `check` until it resolves true, or throws after `timeoutMs` (the handler runs off-request). */
async function waitFor(check: () => Promise<boolean>, timeoutMs = 3000, intervalMs = 50): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    if (await check()) return;
    if (Date.now() >= deadline) throw new Error('waitFor: condition never became true');
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

describe.skipIf(!process.env.DATABASE_URL)('AI-learning domain-event handler (TC-16)', () => {
  const app = createApp();

  beforeEach(async () => {
    await flushRateLimits();
    registerAiLearningHandler(); // re-registered fresh after the previous test's resetEventBus()
  });

  afterEach(async () => {
    resetEventBus();
    await cleanupTestUsers();
    const learnedKeys = await redis.keys('ai-learned:*');
    if (learnedKeys.length > 0) await redis.del(...learnedKeys);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function loginAs(): Promise<{ userId: string; accessToken: string }> {
    const user = await createActiveUser();
    const res = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: user.password });
    return { userId: user.id, accessToken: res.body.accessToken as string };
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  function getDefaultCategory(type: 'income' | 'expense', name: string) {
    return prisma.category.findFirstOrThrow({ where: { isDefault: true, type, name } });
  }

  it('TC-16: override teaches a rule; accepting it reinforces to strong; two consecutive corrections replace it (accept in between clears pending)', async () => {
    const { userId, accessToken } = await loginAs();
    const food = await getDefaultCategory('expense', 'Food');
    const entertainment = await getDefaultCategory('expense', 'Entertainment');
    const merchantKey = 'campus cafe';

    // 1) Override: chosen Entertainment, suggested Food -> ai_overridden, teaches a fresh rule.
    const create1 = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({
        type: 'expense',
        categoryId: entertainment.id,
        amount: '5.00',
        txnDate: '2026-01-05',
        description: 'Campus Cafe',
        aiSuggestedCategoryId: food.id,
        aiConfidence: '0.750',
      });
    expect(create1.status).toBe(201);
    expect(create1.body.categorySource).toBe('ai_overridden');

    await waitFor(async () => {
      const rule = await aiRulesRepository.findByMerchantKey(userId, merchantKey);
      return rule !== null && rule.categoryId === entertainment.id && rule.hitCount === 1;
    });

    // 2) Next suggest for the same merchant now resolves via tier 1, at the base confidence.
    const suggest1 = await request(app).post('/api/v1/ai/categorize/suggest').set(auth(accessToken)).send({ description: 'Campus Cafe', type: 'expense' });
    expect(suggest1.status).toBe(200);
    expect(suggest1.body).toMatchObject({ categoryName: 'Entertainment', tier: 1, confidence: '0.8' });

    // 3) Accepting the tier-1 suggestion -> categorySource 'rule', reinforces hitCount to the strong threshold.
    const create2 = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({
        type: 'expense',
        categoryId: entertainment.id,
        amount: '5.00',
        txnDate: '2026-01-05',
        description: 'Campus Cafe',
        aiSuggestedCategoryId: entertainment.id,
        aiConfidence: '0.8',
      });
    expect(create2.status).toBe(201);
    expect(create2.body.categorySource).toBe('rule');

    await waitFor(async () => {
      const rule = await aiRulesRepository.findByMerchantKey(userId, merchantKey);
      return rule !== null && rule.hitCount === AI_RULE_STRONG_MIN_HITS && rule.pendingCategoryId === null;
    });

    const suggest2 = await request(app).post('/api/v1/ai/categorize/suggest').set(auth(accessToken)).send({ description: 'Campus Cafe', type: 'expense' });
    expect(suggest2.body).toMatchObject({ tier: 1, confidence: '0.95' });

    // 4) First override to Food after this: sets `pending`, rule itself stays Entertainment.
    const create3 = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({
        type: 'expense',
        categoryId: food.id,
        amount: '5.00',
        txnDate: '2026-01-05',
        description: 'Campus Cafe',
        aiSuggestedCategoryId: entertainment.id,
        aiConfidence: '0.95',
      });
    expect(create3.status).toBe(201);
    expect(create3.body.categorySource).toBe('ai_overridden');

    await waitFor(async () => {
      const rule = await aiRulesRepository.findByMerchantKey(userId, merchantKey);
      return rule !== null && rule.categoryId === entertainment.id && rule.pendingCategoryId === food.id;
    });

    // 5) An accept in between clears the pending state (and reinforces again).
    const create4 = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({
        type: 'expense',
        categoryId: entertainment.id,
        amount: '5.00',
        txnDate: '2026-01-05',
        description: 'Campus Cafe',
        aiSuggestedCategoryId: entertainment.id,
        aiConfidence: '0.95',
      });
    expect(create4.body.categorySource).toBe('rule');

    await waitFor(async () => {
      const rule = await aiRulesRepository.findByMerchantKey(userId, merchantKey);
      return rule !== null && rule.pendingCategoryId === null && rule.hitCount === AI_RULE_STRONG_MIN_HITS + 1;
    });

    // 6) Two FRESH consecutive overrides to Food now replace the rule outright.
    const create5 = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({
        type: 'expense',
        categoryId: food.id,
        amount: '5.00',
        txnDate: '2026-01-05',
        description: 'Campus Cafe',
        aiSuggestedCategoryId: entertainment.id,
        aiConfidence: '0.95',
      });
    expect(create5.body.categorySource).toBe('ai_overridden');
    await waitFor(async () => {
      const rule = await aiRulesRepository.findByMerchantKey(userId, merchantKey);
      return rule !== null && rule.categoryId === entertainment.id && rule.pendingCategoryId === food.id;
    });

    const create6 = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({
        type: 'expense',
        categoryId: food.id,
        amount: '5.00',
        txnDate: '2026-01-05',
        description: 'Campus Cafe',
        aiSuggestedCategoryId: entertainment.id,
        aiConfidence: '0.95',
      });
    expect(create6.body.categorySource).toBe('ai_overridden');

    await waitFor(async () => {
      const rule = await aiRulesRepository.findByMerchantKey(userId, merchantKey);
      return rule !== null && rule.categoryId === food.id && rule.hitCount === AI_RULE_REPLACE_AFTER && rule.pendingCategoryId === null;
    });
  }, 20_000);

  it('a recurring-source transaction is never learned from', async () => {
    const { userId } = await loginAs();

    await handleAiLearning('created', {
      userId,
      categoryId: 1,
      month: '2026-01-01',
      amount: '5.00',
      type: 'expense',
      transactionId: randomUUID(),
      version: 1,
      merchantKey: 'recurringmerchant',
      source: 'recurring',
      categorySource: 'user',
    });

    const rule = await aiRulesRepository.findByMerchantKey(userId, 'recurringmerchant');
    expect(rule).toBeNull();
  });

  it('replaying the exact same event (same transactionId + version) never double-counts', async () => {
    const { userId } = await loginAs();
    const food = await getDefaultCategory('expense', 'Food');

    const payload = {
      userId,
      categoryId: food.id,
      month: '2026-01-01',
      amount: '5.00',
      type: 'expense' as const,
      transactionId: randomUUID(),
      version: 3,
      merchantKey: 'replaymerchant',
      source: 'manual' as const,
      categorySource: 'user' as const,
    };

    await handleAiLearning('created', payload);
    await handleAiLearning('created', payload); // replay of the exact same event

    const rule = await aiRulesRepository.findByMerchantKey(userId, 'replaymerchant');
    expect(rule).not.toBeNull();
    expect(rule!.hitCount).toBe(1);
  });

  it('a PATCH that changes the category also learns from the correction', async () => {
    const { accessToken, userId } = await loginAs();
    const food = await getDefaultCategory('expense', 'Food');
    const transport = await getDefaultCategory('expense', 'Transport');
    const merchantKey = 'patchable merchant example';

    const create = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: food.id, amount: '5.00', txnDate: '2026-01-05', description: 'Patchable merchant example' });
    expect(create.status).toBe(201);
    const id = create.body.id as string;

    // D13 (known issue): the plain `create` above already taught a rule pointing at Food (the
    // category picked, even though the user never touched an AI suggestion) — wait for it first
    // so the assertions below observe the PATCH's own effect, not a race with the create's.
    await waitFor(async () => {
      const rule = await aiRulesRepository.findByMerchantKey(userId, merchantKey);
      return rule !== null && rule.categoryId === food.id;
    });

    const patch = await request(app).patch(`/api/v1/transactions/${id}`).set(auth(accessToken)).send({ categoryId: transport.id, version: 1 });
    expect(patch.status).toBe(200);

    // First correction away from the existing rule sets `pendingCategoryId` (D4's state machine);
    // a second identical correction would replace it outright (already covered by the TC-16 test above).
    await waitFor(async () => {
      const rule = await aiRulesRepository.findByMerchantKey(userId, merchantKey);
      return rule !== null && rule.categoryId === food.id && rule.pendingCategoryId === transport.id;
    });
  });
});
