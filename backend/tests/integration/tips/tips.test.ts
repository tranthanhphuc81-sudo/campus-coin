/**
 * tips.test.ts
 * Integration tests for `/api/v1/tips/*` against real MySQL + Redis (skipped without
 * DATABASE_URL), mirroring `tests/integration/reports/reports.test.ts`'s setup. Covers TC-23
 * (docs/spec/12): a dismissed tip must not reappear within 30 days, even after a fresh
 * `refreshForUser()` run for the same rule+category.
 * Spec: docs/spec/05b §5.10 · docs/spec/07 §7.3.3 · docs/spec/12 (TC-23)
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { createActiveUser, cleanupTestUsers, flushRateLimits } = await import('../../fixtures/auth.js');
const { firstDayOfMonth, todayInTimeZone, toDbDate } = await import('../../../src/lib/dates.js');
const { refreshForUser } = await import('../../../src/modules/tips/tips.service.js');
const { tipsRepository } = await import('../../../src/modules/tips/tips.repository.js');

interface TipItem {
  id: string;
  ruleType: string;
  categoryId: number | null;
  categoryName: string | null;
  period: string;
  title: string;
  body: string;
  impactAmount: string;
  score: number;
  status: string;
  dismissedUntil: string | null;
  createdAt: string;
}

describe.skipIf(!process.env.DATABASE_URL)('/api/v1/tips', () => {
  const app = createApp();

  beforeEach(async () => {
    await flushRateLimits();
  });

  afterEach(async () => {
    await cleanupTestUsers();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function loginAs(): Promise<{ userId: string; accessToken: string; timezone: string }> {
    const user = await createActiveUser();
    const res = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: user.password });
    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return { userId: user.id, accessToken: res.body.accessToken as string, timezone: dbUser.timezone };
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  /** Directly inserts a `UserTip` row (bypassing the refresh engine) for a given template code. */
  async function insertTip(
    userId: string,
    period: string,
    templateCode: string,
    overrides: Partial<{ categoryId: number | null; status: 'active' | 'pinned' | 'dismissed'; score: string; impactAmount: string }> = {},
  ) {
    const template = await prisma.tipTemplate.findFirstOrThrow({ where: { code: templateCode } });
    return prisma.userTip.create({
      data: {
        userId,
        templateId: template.id,
        categoryId: overrides.categoryId ?? null,
        period: toDbDate(period),
        renderedTitle: template.titleTpl,
        renderedBody: template.bodyTpl,
        impactAmount: overrides.impactAmount ?? '10.00',
        score: overrides.score ?? '1.0000',
        status: overrides.status ?? 'active',
      },
    });
  }

  describe('GET /tips', () => {
    it('returns an empty list when the user has no tips yet', async () => {
      const { accessToken } = await loginAs();
      const res = await request(app).get('/api/v1/tips').set(auth(accessToken));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: [] });
    });

    it('returns a manually-inserted current-period tip, correctly shaped', async () => {
      const { userId, accessToken, timezone } = await loginAs();
      const period = firstDayOfMonth(todayInTimeZone(timezone));
      await insertTip(userId, period, 'R0_GENERAL_1');

      const res = await request(app).get('/api/v1/tips').set(auth(accessToken));
      expect(res.status).toBe(200);
      const items = res.body.data as TipItem[];
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ ruleType: 'general', categoryId: null, categoryName: null, period, status: 'active', dismissedUntil: null });
      expect(items[0]!.title.length).toBeGreaterThan(0);
      expect(items[0]!.impactAmount).toBe('10.00');
      expect(typeof items[0]!.score).toBe('number');
      expect(typeof items[0]!.id).toBe('string');
    });

    it('excludes a dismissed tip and sorts pinned first', async () => {
      const { userId, accessToken, timezone } = await loginAs();
      const period = firstDayOfMonth(todayInTimeZone(timezone));
      const lowScore = await insertTip(userId, period, 'R0_GENERAL_1', { score: '1.0000' });
      const pinned = await insertTip(userId, period, 'R0_GENERAL_2', { score: '0.1000', status: 'pinned' });
      await insertTip(userId, period, 'R0_GENERAL_3', { score: '5.0000', status: 'dismissed' });

      const res = await request(app).get('/api/v1/tips').set(auth(accessToken));
      expect(res.status).toBe(200);
      const items = res.body.data as TipItem[];
      expect(items).toHaveLength(2);
      // Pinned sorts first even though its score is lower than the active one.
      expect(items[0]!.id).toBe(pinned.id.toString());
      expect(items[1]!.id).toBe(lowScore.id.toString());
    });
  });

  describe('POST /tips/:id/pin, /unpin, /dismiss', () => {
    it('pins, unpins, then dismisses a tip, each reflected on the next GET', async () => {
      const { userId, accessToken, timezone } = await loginAs();
      const period = firstDayOfMonth(todayInTimeZone(timezone));
      const tip = await insertTip(userId, period, 'R0_GENERAL_1');

      const pinRes = await request(app).post(`/api/v1/tips/${tip.id}/pin`).set(auth(accessToken));
      expect(pinRes.status).toBe(200);
      expect(pinRes.body.status).toBe('pinned');

      const unpinRes = await request(app).post(`/api/v1/tips/${tip.id}/unpin`).set(auth(accessToken));
      expect(unpinRes.status).toBe(200);
      expect(unpinRes.body.status).toBe('active');

      const dismissRes = await request(app).post(`/api/v1/tips/${tip.id}/dismiss`).set(auth(accessToken));
      expect(dismissRes.status).toBe(200);
      expect(dismissRes.body.status).toBe('dismissed');
      expect(dismissRes.body.dismissedUntil).not.toBeNull();

      const listRes = await request(app).get('/api/v1/tips').set(auth(accessToken));
      expect(listRes.body.data).toEqual([]);
    });

    it('cross-tenant pin/dismiss of another user\'s tip is a 404, not a 403', async () => {
      const owner = await loginAs();
      const stranger = await loginAs();
      const period = firstDayOfMonth(todayInTimeZone(owner.timezone));
      const tip = await insertTip(owner.userId, period, 'R0_GENERAL_1');

      const pinRes = await request(app).post(`/api/v1/tips/${tip.id}/pin`).set(auth(stranger.accessToken));
      expect(pinRes.status).toBe(404);

      const dismissRes = await request(app).post(`/api/v1/tips/${tip.id}/dismiss`).set(auth(stranger.accessToken));
      expect(dismissRes.status).toBe(404);
    });

    it('a missing tip id is a 404', async () => {
      const { accessToken } = await loginAs();
      const res = await request(app).post('/api/v1/tips/999999999/pin').set(auth(accessToken));
      expect(res.status).toBe(404);
    });
  });

  describe('TC-23: a dismissed tip does not reappear within 30 days', () => {
    it('stays dismissed across a fresh refreshForUser() run for the same rule+category', async () => {
      const { userId, accessToken, timezone } = await loginAs();
      const period = firstDayOfMonth(todayInTimeZone(timezone));
      const tip = await insertTip(userId, period, 'R0_GENERAL_1'); // R0 (general, categoryId: null) always fires.

      const dismissRes = await request(app).post(`/api/v1/tips/${tip.id}/dismiss`).set(auth(accessToken));
      expect(dismissRes.status).toBe(200);

      const today = todayInTimeZone(timezone);
      const stillDismissed = await tipsRepository.isDismissedForRuleCategory(userId, 'general', null, today);
      expect(stillDismissed).toBe(true);

      // R0 always fires; a naive refresh would re-create a "general" tip for this period if the
      // dismiss window were not respected.
      await refreshForUser(userId);

      const listRes = await request(app).get('/api/v1/tips').set(auth(accessToken));
      const generalTips = (listRes.body.data as TipItem[]).filter((t) => t.ruleType === 'general');
      expect(generalTips).toHaveLength(0);
    });
  });
});
