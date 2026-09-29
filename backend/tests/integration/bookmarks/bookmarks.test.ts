/**
 * bookmarks.test.ts
 * Integration tests for `/api/v1/bookmarks` (docs/spec/05c §5.12) against real MySQL (skipped
 * without DATABASE_URL): full CRUD, note-length validation, duplicate `(targetType, targetRef)`,
 * `q`/`type` filters, target enrichment (tip + insight, including `available: false` once the tip
 * is deleted), the `BOOKMARKS_MAX_PER_USER` cap, and cross-tenant isolation.
 * Spec: docs/spec/05c §5.12
 */
import { BOOKMARKS_MAX_PER_USER } from '@campuscoin/shared';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { createActiveUser, cleanupTestUsers, flushRateLimits } = await import('../../fixtures/auth.js');
const { toDbDate } = await import('../../../src/lib/dates.js');

describe.skipIf(!process.env.DATABASE_URL)('/api/v1/bookmarks', () => {
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

  async function loginAs(): Promise<{ userId: string; accessToken: string }> {
    const user = await createActiveUser();
    const res = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: user.password });
    return { userId: user.id, accessToken: res.body.accessToken as string };
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  /** Directly seeds a `completed` UserTip row (rendered from a real, always-seeded template). */
  async function seedTip(userId: string, categoryId: number): Promise<bigint> {
    const template = await prisma.tipTemplate.findFirstOrThrow();
    const tip = await prisma.userTip.create({
      data: {
        userId,
        templateId: template.id,
        categoryId,
        period: toDbDate('2026-01-01'),
        renderedTitle: 'You spent a lot on Food this month',
        renderedBody: 'x'.repeat(200), // long enough to exercise the ~140-char excerpt truncation
        impactAmount: '25.00',
        score: '1.0000',
        status: 'active',
      },
    });
    return tip.id;
  }

  /** Directly seeds a `completed` Insight row for one month. */
  async function seedInsight(userId: string, month: string): Promise<void> {
    await prisma.insight.create({
      data: {
        userId,
        month: toDbDate(month),
        summaryText: 'You spent less than usual this month. Great job staying on budget!',
        tipText: 'Keep it up next month.',
        flaggedPatterns: [],
        statsSnapshot: {},
        generator: 'template',
        status: 'completed',
        regenerateCount: 0,
      },
    });
  }

  it('full CRUD: create a report bookmark, list it, edit its note, then delete it', async () => {
    const { accessToken } = await loginAs();

    const create = await request(app)
      .post('/api/v1/bookmarks')
      .set(auth(accessToken))
      .send({ targetType: 'report', targetRef: 'overview', note: 'Check this monthly' });
    expect(create.status).toBe(201);
    expect(create.body).toMatchObject({
      targetType: 'report',
      targetRef: 'overview',
      note: 'Check this monthly',
      target: { available: true, title: null, excerpt: null },
    });
    const id = create.body.id as number;

    const list = await request(app).get('/api/v1/bookmarks').set(auth(accessToken));
    expect(list.status).toBe(200);
    expect(list.body.data.some((b: { id: number }) => b.id === id)).toBe(true);

    const patch = await request(app).patch(`/api/v1/bookmarks/${id}`).set(auth(accessToken)).send({ note: 'Updated note' });
    expect(patch.status).toBe(200);
    expect(patch.body.note).toBe('Updated note');

    const del = await request(app).delete(`/api/v1/bookmarks/${id}`).set(auth(accessToken));
    expect(del.status).toBe(204);

    const afterDelete = await request(app).get('/api/v1/bookmarks').set(auth(accessToken));
    expect(afterDelete.body.data.some((b: { id: number }) => b.id === id)).toBe(false);
  });

  it('rejects a note over 500 characters with a 422', async () => {
    const { accessToken } = await loginAs();
    const res = await request(app)
      .post('/api/v1/bookmarks')
      .set(auth(accessToken))
      .send({ targetType: 'report', targetRef: 'by-period', note: 'x'.repeat(501) });
    expect(res.status).toBe(422);
  });

  it('B-L1: rejects a tip targetRef above the BIGINT max with a 422, not a 500', async () => {
    const { accessToken } = await loginAs();
    const res = await request(app)
      .post('/api/v1/bookmarks')
      .set(auth(accessToken))
      .send({ targetType: 'tip', targetRef: '99999999999999999999' }); // 20 digits, above the signed BIGINT ceiling.
    expect(res.status).toBe(422);
  });

  it('B-L8: rejects an absurd ?page= with a 422, not a 500', async () => {
    const { accessToken } = await loginAs();
    const res = await request(app).get('/api/v1/bookmarks?page=999999999').set(auth(accessToken));
    expect(res.status).toBe(422);
  });

  it('rejects a duplicate (targetType, targetRef) with a 409', async () => {
    const { accessToken } = await loginAs();
    const first = await request(app).post('/api/v1/bookmarks').set(auth(accessToken)).send({ targetType: 'report', targetRef: 'by-category' });
    expect(first.status).toBe(201);

    const dup = await request(app).post('/api/v1/bookmarks').set(auth(accessToken)).send({ targetType: 'report', targetRef: 'by-category' });
    expect(dup.status).toBe(409);
  });

  it('filters by q (note substring) and by type', async () => {
    const { accessToken } = await loginAs();
    await request(app).post('/api/v1/bookmarks').set(auth(accessToken)).send({ targetType: 'report', targetRef: 'overview', note: 'Rent tracking' });
    await request(app).post('/api/v1/bookmarks').set(auth(accessToken)).send({ targetType: 'report', targetRef: 'forecast', note: 'Groceries budget' });

    const byQ = await request(app).get('/api/v1/bookmarks?q=Rent').set(auth(accessToken));
    expect(byQ.status).toBe(200);
    expect(byQ.body.data).toHaveLength(1);
    expect(byQ.body.data[0].note).toBe('Rent tracking');

    const byType = await request(app).get('/api/v1/bookmarks?type=report').set(auth(accessToken));
    expect(byType.status).toBe(200);
    expect(byType.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it('enriches a tip bookmark and an insight bookmark, and flags a tip as unavailable once deleted', async () => {
    const { userId, accessToken } = await loginAs();
    const category = await prisma.category.findFirstOrThrow({ where: { isDefault: true, type: 'expense' } });
    const tipId = await seedTip(userId, category.id);
    await seedInsight(userId, '2026-01-01');

    const tipBookmark = await request(app).post('/api/v1/bookmarks').set(auth(accessToken)).send({ targetType: 'tip', targetRef: tipId.toString() });
    expect(tipBookmark.status).toBe(201);

    const insightBookmark = await request(app).post('/api/v1/bookmarks').set(auth(accessToken)).send({ targetType: 'insight', targetRef: '2026-01-01' });
    expect(insightBookmark.status).toBe(201);

    let list = await request(app).get('/api/v1/bookmarks').set(auth(accessToken));
    expect(list.status).toBe(200);
    const tipRow = list.body.data.find((b: { id: number }) => b.id === tipBookmark.body.id);
    expect(tipRow.target.available).toBe(true);
    expect(tipRow.target.title).toBe('You spent a lot on Food this month');
    expect(tipRow.target.excerpt).toHaveLength(140);

    const insightRow = list.body.data.find((b: { id: number }) => b.id === insightBookmark.body.id);
    expect(insightRow.target).toMatchObject({ available: true, title: null });
    expect(insightRow.target.excerpt).toContain('You spent less than usual');

    await prisma.userTip.delete({ where: { id: tipId } });

    list = await request(app).get('/api/v1/bookmarks').set(auth(accessToken));
    const staleTipRow = list.body.data.find((b: { id: number }) => b.id === tipBookmark.body.id);
    expect(staleTipRow.target).toMatchObject({ available: false, title: null, excerpt: null });
  });

  it('returns 409 once BOOKMARKS_MAX_PER_USER is reached', async () => {
    const { userId, accessToken } = await loginAs();
    await prisma.bookmark.createMany({
      data: Array.from({ length: BOOKMARKS_MAX_PER_USER }, (_, i) => ({ userId, targetType: 'report' as const, targetRef: `overview?fill=${i}` })),
    });

    const res = await request(app).post('/api/v1/bookmarks').set(auth(accessToken)).send({ targetType: 'report', targetRef: 'forecast' });
    expect(res.status).toBe(409);
  });

  it('cross-tenant: another user cannot see, edit, delete or create against user A\'s bookmarks/tips/insights', async () => {
    const userA = await loginAs();
    const userB = await loginAs();
    const category = await prisma.category.findFirstOrThrow({ where: { isDefault: true, type: 'expense' } });
    const tipId = await seedTip(userA.userId, category.id);
    await seedInsight(userA.userId, '2026-02-01');

    const aBookmark = await request(app).post('/api/v1/bookmarks').set(auth(userA.accessToken)).send({ targetType: 'report', targetRef: 'overview' });
    expect(aBookmark.status).toBe(201);
    const aId = aBookmark.body.id as number;

    const bList = await request(app).get('/api/v1/bookmarks').set(auth(userB.accessToken));
    expect(bList.status).toBe(200);
    expect(bList.body.data.some((b: { id: number }) => b.id === aId)).toBe(false);

    const bPatch = await request(app).patch(`/api/v1/bookmarks/${aId}`).set(auth(userB.accessToken)).send({ note: 'hijacked' });
    expect(bPatch.status).toBe(404);

    const bDelete = await request(app).delete(`/api/v1/bookmarks/${aId}`).set(auth(userB.accessToken));
    expect(bDelete.status).toBe(404);

    const bCreateTip = await request(app).post('/api/v1/bookmarks').set(auth(userB.accessToken)).send({ targetType: 'tip', targetRef: tipId.toString() });
    expect(bCreateTip.status).toBe(404);

    const bCreateInsight = await request(app).post('/api/v1/bookmarks').set(auth(userB.accessToken)).send({ targetType: 'insight', targetRef: '2026-02-01' });
    expect(bCreateInsight.status).toBe(404);
  });
});
