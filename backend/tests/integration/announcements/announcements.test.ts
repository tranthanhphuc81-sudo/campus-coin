/**
 * announcements.test.ts
 * Integration tests for `/api/v1/announcements/active` against real MySQL + Redis (skipped
 * without DATABASE_URL). This endpoint is public (`P/S`): no Authorization header is ever sent
 * here. Admin CRUD ships in P15 — rows are seeded directly via Prisma.
 * Spec: docs/spec/05c §5.13 (announcements) · docs/spec/07 §7.3.3
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { flushRateLimits } = await import('../../fixtures/auth.js');
const { cacheDel } = await import('../../../src/lib/cache.js');
const { announcementsActiveKey } = await import('../../../src/lib/cacheKeys.js');

describe.skipIf(!process.env.DATABASE_URL)('/api/v1/announcements', () => {
  const app = createApp();
  const createdIds: number[] = [];

  beforeEach(async () => {
    await flushRateLimits();
    await cacheDel(announcementsActiveKey());
  });

  afterEach(async () => {
    if (createdIds.length > 0) {
      await prisma.announcement.deleteMany({ where: { id: { in: createdIds } } });
      createdIds.length = 0;
    }
    await cacheDel(announcementsActiveKey());
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('GET /active returns a currently-active announcement, no Authorization header needed', async () => {
    const now = new Date();
    const row = await prisma.announcement.create({
      data: {
        title: 'Scheduled maintenance',
        body: 'The service will be briefly unavailable tonight.',
        level: 'info',
        startsAt: new Date(now.getTime() - 60_000),
        isActive: true,
      },
    });
    createdIds.push(row.id);

    const res = await request(app).get('/api/v1/announcements/active');
    expect(res.status).toBe(200);
    expect((res.body as Array<{ id: number; title: string }>).some((a) => a.id === row.id && a.title === row.title)).toBe(true);
  });

  it('excludes an announcement that has already ended', async () => {
    const now = new Date();
    const row = await prisma.announcement.create({
      data: {
        title: 'Old notice',
        body: 'This already ended.',
        level: 'info',
        startsAt: new Date(now.getTime() - 120_000),
        endsAt: new Date(now.getTime() - 60_000),
        isActive: true,
      },
    });
    createdIds.push(row.id);

    const res = await request(app).get('/api/v1/announcements/active');
    expect(res.status).toBe(200);
    expect((res.body as Array<{ id: number }>).some((a) => a.id === row.id)).toBe(false);
  });

  it('excludes an inactive (unpublished) announcement', async () => {
    const now = new Date();
    const row = await prisma.announcement.create({
      data: {
        title: 'Draft notice',
        body: 'Not published yet.',
        level: 'warning',
        startsAt: new Date(now.getTime() - 60_000),
        isActive: false,
      },
    });
    createdIds.push(row.id);

    const res = await request(app).get('/api/v1/announcements/active');
    expect(res.status).toBe(200);
    expect((res.body as Array<{ id: number }>).some((a) => a.id === row.id)).toBe(false);
  });
});
