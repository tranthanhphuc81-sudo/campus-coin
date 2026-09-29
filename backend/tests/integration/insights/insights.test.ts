/**
 * insights.test.ts
 * Integration tests for `/api/v1/insights/*` against real MySQL + Redis (skipped without
 * DATABASE_URL), mirroring `reports.test.ts`'s setup. `insightGenerateQueue.add` is mocked so no
 * real worker/BullMQ connection is needed. Covers an empty history, a manually-inserted row
 * round-tripping through `GET /:month`, `regenerate`'s 404/202/429 outcomes, and the cross-tenant
 * 404 invariant (never 403).
 * Note: these hit the full app via `createApp()`, so they only pass once `insightsRouter` is
 * mounted at `${API_BASE_PATH}/insights` in `app.ts` (a follow-up wiring step, out of this
 * module's scope per the phase prompt).
 * Spec: docs/spec/05b §5.9 · docs/spec/07 §7.3.3
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const insightQueueAddMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../src/jobs/queues.js', () => ({ insightGenerateQueue: { add: insightQueueAddMock } }));

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { createActiveUser, cleanupTestUsers, flushRateLimits } = await import('../../fixtures/auth.js');
const { toDbDate } = await import('../../../src/lib/dates.js');

describe.skipIf(!process.env.DATABASE_URL)('/api/v1/insights', () => {
  const app = createApp();

  beforeEach(async () => {
    await flushRateLimits();
    insightQueueAddMock.mockClear();
  });

  afterEach(async () => {
    await cleanupTestUsers();
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

  describe('GET /', () => {
    it('returns an empty page when the caller has no insights yet', async () => {
      const { accessToken } = await loginAs();
      const res = await request(app).get('/api/v1/insights').set(auth(accessToken));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ data: [], total: 0 });
    });
  });

  describe('GET /:month', () => {
    it('round-trips a manually-inserted row with the correct regenerateRemaining', async () => {
      const { userId, accessToken } = await loginAs();
      await prisma.insight.create({
        data: {
          userId,
          month: toDbDate('2024-01-01'),
          summaryText: 'Steady month.',
          tipText: 'Keep it up.',
          flaggedPatterns: [],
          statsSnapshot: { savingsRatePct: 20 },
          generator: 'template',
          status: 'completed',
          regenerateCount: 1,
          generatedAt: new Date(),
        },
      });

      // Any date within the month resolves to the row's normalised first-of-month.
      const res = await request(app).get('/api/v1/insights/2024-01-15').set(auth(accessToken));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        month: '2024-01-01',
        summaryText: 'Steady month.',
        tipText: 'Keep it up.',
        regenerateCount: 1,
        regenerateRemaining: 2,
        savingsRatePct: 20,
      });
    });

    it("cross-tenant: another user's month is 404, never 403", async () => {
      const owner = await loginAs();
      const intruder = await loginAs();
      await prisma.insight.create({
        data: { userId: owner.userId, month: toDbDate('2024-02-01'), generator: 'template', status: 'completed' },
      });

      const res = await request(app).get('/api/v1/insights/2024-02-01').set(auth(intruder.accessToken));
      expect(res.status).toBe(404);
    });
  });

  describe('POST /:month/regenerate', () => {
    it('404s when no insight row exists yet for that month (regenerate never creates a first-time row)', async () => {
      const { accessToken } = await loginAs();
      const res = await request(app).post('/api/v1/insights/2024-03-01/regenerate').set(auth(accessToken));
      expect(res.status).toBe(404);
      expect(insightQueueAddMock).not.toHaveBeenCalled();
    });

    it('increments regenerateCount, flips status to queued, and enqueues a job (202) for a completed row', async () => {
      const { userId, accessToken } = await loginAs();
      await prisma.insight.create({
        data: { userId, month: toDbDate('2024-04-01'), generator: 'template', status: 'completed', regenerateCount: 0 },
      });

      const res = await request(app).post('/api/v1/insights/2024-04-01/regenerate').set(auth(accessToken));
      expect(res.status).toBe(202);
      expect(insightQueueAddMock).toHaveBeenCalledTimes(1);

      const [name, data, opts] = insightQueueAddMock.mock.calls[0] as [string, { userId: string; month: string }, { jobId: string }];
      expect(name).toBe('insight-generate');
      expect(data.userId).toBe(userId);
      expect(opts.jobId).toBe(`insight-${userId}-2024-04-01-r1`);

      const row = await prisma.insight.findUnique({ where: { userId_month: { userId, month: toDbDate('2024-04-01') } } });
      expect(row?.regenerateCount).toBe(1);
      expect(row?.status).toBe('queued');
    });

    it('a 4th regenerate call is rejected (429, Retry-After) once the monthly cap is used up', async () => {
      const { userId, accessToken } = await loginAs();
      await prisma.insight.create({
        data: { userId, month: toDbDate('2024-05-01'), generator: 'template', status: 'completed', regenerateCount: 0 },
      });

      let last;
      for (let i = 0; i < 4; i += 1) {
        last = await request(app).post('/api/v1/insights/2024-05-01/regenerate').set(auth(accessToken));
        // The route itself flips status to 'queued'; reset to 'completed' between calls so only the
        // regenerate cap (not the "generation already in progress" 409) is under test.
        await prisma.insight.updateMany({ where: { userId, month: toDbDate('2024-05-01') }, data: { status: 'completed' } });
      }

      expect(last!.status).toBe(429);
      expect(last!.headers['retry-after']).toBeDefined();
      expect(insightQueueAddMock).toHaveBeenCalledTimes(3);
    });
  });
});
