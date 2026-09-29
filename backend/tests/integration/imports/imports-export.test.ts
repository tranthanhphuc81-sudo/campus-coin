/**
 * imports-export.test.ts
 * Integration tests for `GET /imports/template` and `GET /imports/:id/errors.csv` against real
 * MySQL + Redis (skipped without DATABASE_URL). TC-19: a formula-injection cell in the error
 * report is neutralised with a leading `'`; every download carries the safe-file headers
 * (attachment, nosniff, text/csv).
 * Spec: docs/spec/09 §9.10 (TC-19) · docs/spec/05a §5.5 (Table 19)
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { createActiveUser, cleanupTestUsers, flushRateLimits } = await import('../../fixtures/auth.js');
const importsService = await import('../../../src/modules/imports/imports.service.js');

describe.skipIf(!process.env.DATABASE_URL)('CSV import downloads (template, errors.csv)', () => {
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

  it('GET /imports/template returns the sample CSV with safe download headers', async () => {
    const { accessToken } = await loginAs();
    const res = await request(app).get('/api/v1/imports/template').set(auth(accessToken));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('campuscoin-import-template.csv');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.text).toContain('date,amount,type,description,category');
    expect(res.text).toContain('Campus Cafe latte');
  });

  it('TC-19: errors.csv neutralises a formula-injection cell and carries safe download headers', async () => {
    const { accessToken, userId } = await loginAs();
    const csv = 'date,amount,type,description,category\n2024-01-17,not-a-number,expense,"=HYPERLINK(""http://evil.example"",""x"")",Food\n';
    const upload = await request(app).post('/api/v1/imports').set(auth(accessToken)).attach('file', Buffer.from(csv, 'utf8'), { filename: 'inject.csv', contentType: 'text/csv' });
    const batchId = upload.body.batchId as string;
    await importsService.parseBatch({ batchId, userId, rev: 0 });

    const res = await request(app).get(`/api/v1/imports/${batchId}/errors.csv`).set(auth(accessToken));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain(`import-errors-${batchId}.csv`);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.text).toContain("'=HYPERLINK");
    expect(res.text).not.toMatch(/[^']=HYPERLINK/); // never appears WITHOUT the neutralising leading quote
  });

  it('errors.csv is downloadable even after the Redis preview has been cleared by a commit', async () => {
    const { accessToken, userId } = await loginAs();
    const csv = 'date,amount,type,description,category\n2024-01-18,5.00,expense,Good row,Food\n2024-01-19,bad,expense,Bad row,Food\n';
    const upload = await request(app).post('/api/v1/imports').set(auth(accessToken)).attach('file', Buffer.from(csv, 'utf8'), { filename: 'mixed.csv', contentType: 'text/csv' });
    const batchId = upload.body.batchId as string;
    await importsService.parseBatch({ batchId, userId, rev: 0 });

    await request(app).post(`/api/v1/imports/${batchId}/commit`).set(auth(accessToken)).expect(200);

    const res = await request(app).get(`/api/v1/imports/${batchId}/errors.csv`).set(auth(accessToken));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Bad row');
  });
});
