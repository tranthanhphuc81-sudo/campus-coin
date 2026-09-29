/**
 * imports-cross-tenant.test.ts
 * Integration tests proving every `/imports/:id*` entry point returns 404 (never 403/500) for a
 * batch owned by a different user, and for a random non-existent id — against real MySQL + Redis
 * (skipped without DATABASE_URL). CLAUDE.md invariant: a resource owned by another user is 404,
 * never 403, so its existence is never leaked.
 * Spec: docs/spec/07 §7.2 (Table 41) · CLAUDE.md security invariants
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { createActiveUser, cleanupTestUsers, flushRateLimits } = await import('../../fixtures/auth.js');
const importsService = await import('../../../src/modules/imports/imports.service.js');

describe.skipIf(!process.env.DATABASE_URL)('Cross-tenant access to /imports/:id*', () => {
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

  it('every entry point 404s for a batch owned by another user, and for a random id', async () => {
    const owner = await loginAs();
    const csv = 'date,amount,type,description,category\n2024-01-20,4.00,expense,Owner-only row,Food\n';
    const upload = await request(app)
      .post('/api/v1/imports')
      .set(auth(owner.accessToken))
      .attach('file', Buffer.from(csv, 'utf8'), { filename: 'owner.csv', contentType: 'text/csv' });
    expect(upload.status).toBe(202);
    const batchId = upload.body.batchId as string;
    await importsService.parseBatch({ batchId, userId: owner.userId, rev: 0 });

    const other = await loginAs();
    const randomId = randomUUID();

    for (const id of [batchId, randomId]) {
      const get = await request(app).get(`/api/v1/imports/${id}`).set(auth(other.accessToken));
      expect(get.status).toBe(404);

      const patch = await request(app).patch(`/api/v1/imports/${id}/rows`).set(auth(other.accessToken)).send({ setAllSelected: true });
      expect(patch.status).toBe(404);

      const commit = await request(app).post(`/api/v1/imports/${id}/commit`).set(auth(other.accessToken));
      expect(commit.status).toBe(404);

      const errorsCsv = await request(app).get(`/api/v1/imports/${id}/errors.csv`).set(auth(other.accessToken));
      expect(errorsCsv.status).toBe(404);

      const del = await request(app).delete(`/api/v1/imports/${id}`).set(auth(other.accessToken));
      expect(del.status).toBe(404);
    }

    // The owner's own batch is untouched by all of the above.
    const stillThere = await request(app).get(`/api/v1/imports/${batchId}`).set(auth(owner.accessToken));
    expect(stillThere.status).toBe(200);
  });
});
