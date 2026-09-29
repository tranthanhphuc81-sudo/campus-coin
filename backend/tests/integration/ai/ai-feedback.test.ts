/**
 * ai-feedback.test.ts
 * Integration tests for `POST /api/v1/ai/feedback` against real MySQL + Redis (skipped without
 * DATABASE_URL): success (204), cross-tenant transaction id (404), a category not visible to the
 * caller (422), server-side merchant-key normalisation of a raw description, and the shared
 * idempotency guard with the domain-event handler (feedback + handler for the same transaction
 * version counts once).
 * Spec: docs/spec/05b §5.6 (AI categorization) · Rules: D10
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { redis } = await import('../../../src/lib/redis.js');
const { createActiveUser, cleanupTestUsers, flushRateLimits } = await import('../../fixtures/auth.js');
const { _resetForTests: resetEventBus } = await import('../../../src/events/bus.js');
const { registerAiLearningHandler } = await import('../../../src/events/handlers/ai-learning.handler.js');
const { aiRulesRepository } = await import('../../../src/modules/ai/ai.repository.js');

describe.skipIf(!process.env.DATABASE_URL)('POST /api/v1/ai/feedback', () => {
  const app = createApp();

  beforeEach(async () => {
    await flushRateLimits();
    registerAiLearningHandler();
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

  it('204 on a well-formed feedback submission, teaching a rule', async () => {
    const { userId, accessToken } = await loginAs();
    const food = await getDefaultCategory('expense', 'Food');

    const create = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: food.id, amount: '5.00', txnDate: '2026-01-05', description: 'Feedbackmerchant' });
    const id = create.body.id as string;

    const res = await request(app)
      .post('/api/v1/ai/feedback')
      .set(auth(accessToken))
      .send({ transactionId: id, merchantKey: 'feedbackmerchant', suggestedCategoryId: null, chosenCategoryId: food.id });

    expect(res.status).toBe(204);
    const rule = await aiRulesRepository.findByMerchantKey(userId, 'feedbackmerchant');
    expect(rule).not.toBeNull();
    expect(rule!.categoryId).toBe(food.id);
  });

  it('another user\'s transactionId is 404 (not 403)', async () => {
    const userA = await loginAs();
    const userB = await loginAs();
    const food = await getDefaultCategory('expense', 'Food');

    const create = await request(app)
      .post('/api/v1/transactions')
      .set(auth(userA.accessToken))
      .send({ type: 'expense', categoryId: food.id, amount: '5.00', txnDate: '2026-01-05', description: 'Crosstenantmerchant' });
    const id = create.body.id as string;

    const res = await request(app)
      .post('/api/v1/ai/feedback')
      .set(auth(userB.accessToken))
      .send({ transactionId: id, merchantKey: 'crosstenantmerchant', suggestedCategoryId: null, chosenCategoryId: food.id });

    expect(res.status).toBe(404);
  });

  it('a category not visible to the caller (another user\'s personal category) is 404, not 422 (cross-tenant invariant)', async () => {
    const userA = await loginAs();
    const userB = await loginAs();

    const personal = await prisma.category.create({
      data: { userId: userB.userId, ownerKey: userB.userId, name: 'Private category', type: 'expense' },
    });

    const res = await request(app)
      .post('/api/v1/ai/feedback')
      .set(auth(userA.accessToken))
      .send({ merchantKey: 'somemerchant', suggestedCategoryId: null, chosenCategoryId: personal.id });

    expect(res.status).toBe(404);
  });

  it('a raw (unnormalised) description is normalised server-side before teaching a rule', async () => {
    const { userId, accessToken } = await loginAs();
    const food = await getDefaultCategory('expense', 'Food');

    const res = await request(app)
      .post('/api/v1/ai/feedback')
      .set(auth(accessToken))
      .send({ merchantKey: 'Campus Café #12!', suggestedCategoryId: null, chosenCategoryId: food.id });

    expect(res.status).toBe(204);
    const rule = await aiRulesRepository.findByMerchantKey(userId, 'campus cafe');
    expect(rule).not.toBeNull();
    expect(rule!.categoryId).toBe(food.id);
  });

  it('feedback for the same transaction/version the domain-event handler already learned from counts once', async () => {
    const { userId, accessToken } = await loginAs();
    const food = await getDefaultCategory('expense', 'Food');
    const entertainment = await getDefaultCategory('expense', 'Entertainment');

    // categorySource ai_overridden -> the handler learns automatically off the create event.
    const create = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({
        type: 'expense',
        categoryId: entertainment.id,
        amount: '5.00',
        txnDate: '2026-01-05',
        description: 'Doublecountmerchant',
        aiSuggestedCategoryId: food.id,
        aiConfidence: '0.75',
      });
    const id = create.body.id as string;
    expect(create.body.categorySource).toBe('ai_overridden');

    async function waitFor(check: () => Promise<boolean>, timeoutMs = 3000): Promise<void> {
      const deadline = Date.now() + timeoutMs;
      while (true) {
        if (await check()) return;
        if (Date.now() >= deadline) throw new Error('waitFor: condition never became true');
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    await waitFor(async () => (await aiRulesRepository.findByMerchantKey(userId, 'doublecountmerchant')) !== null);

    // Same transaction, same version -> the feedback call must be a no-op (already learned).
    const feedback = await request(app)
      .post('/api/v1/ai/feedback')
      .set(auth(accessToken))
      .send({ transactionId: id, merchantKey: 'Doublecountmerchant', suggestedCategoryId: food.id, chosenCategoryId: entertainment.id });
    expect(feedback.status).toBe(204);

    const rule = await aiRulesRepository.findByMerchantKey(userId, 'doublecountmerchant');
    expect(rule!.hitCount).toBe(1);
  });
});
