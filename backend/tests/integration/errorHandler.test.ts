/**
 * errorHandler.test.ts
 * Integration tests for the error middleware chain (errorHandler + notFound): every error family
 * from docs/spec/07 Table 41 renders as `application/problem+json` with no leaked internals.
 * Spec: docs/spec/07 §7.2 (Table 41) · docs/spec/09 §9.4 (no stack traces/SQL in errors)
 */
import express, { type Express } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Prisma } from '../../src/generated/prisma/client.js';
import { conflict, internal, rateLimited } from '../../src/lib/problem.js';
import { errorHandler } from '../../src/middlewares/errorHandler.js';
import { notFound } from '../../src/middlewares/notFound.js';
import { requestId } from '../../src/middlewares/requestId.js';

/** Minimal app: requestId + one throwing route + the real notFound/errorHandler chain. */
function buildApp(mount: (app: Express) => void, jsonLimit = '100kb'): Express {
  const app = express();
  app.use(requestId);
  app.use(express.json({ limit: jsonLimit }));
  mount(app);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it('renders an AppError as application/problem+json with the RFC 9457 fields', async () => {
    const app = buildApp((a) =>
      a.get('/boom', () => {
        throw conflict('Duplicate category name');
      }),
    );

    const res = await request(app).get('/boom');

    expect(res.status).toBe(409);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body).toMatchObject({
      type: 'conflict',
      title: 'Conflict',
      status: 409,
      detail: 'Duplicate category name',
      instance: '/boom',
    });
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });

  it('sets Retry-After from a rate-limited AppError', async () => {
    const app = buildApp((a) =>
      a.get('/limited', () => {
        throw rateLimited(7);
      }),
    );

    const res = await request(app).get('/limited');

    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBe('7');
  });

  it('maps Prisma P2002 to 409 conflict', async () => {
    const app = buildApp((a) =>
      a.get('/dup', () => {
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '7.10.0',
        });
      }),
    );

    const res = await request(app).get('/dup');

    expect(res.status).toBe(409);
    expect(res.body.type).toBe('conflict');
  });

  it('maps Prisma P2025 to 404 not-found', async () => {
    const app = buildApp((a) =>
      a.get('/missing', () => {
        throw new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: '7.10.0',
        });
      }),
    );

    const res = await request(app).get('/missing');

    expect(res.status).toBe(404);
    expect(res.body.type).toBe('not-found');
  });

  it('A-L1/B-L2/C-L2: an unmapped Prisma error code (e.g. P2003) never leaks the code or "Prisma" in the response', async () => {
    const app = buildApp((a) =>
      a.get('/fk', () => {
        throw new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
          code: 'P2003',
          clientVersion: '7.10.0',
        });
      }),
    );

    const res = await request(app).get('/fk');

    expect(res.status).toBe(500);
    expect(res.body.type).toBe('internal-error');
    expect(res.body.detail).toBeUndefined();
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('P2003');
    expect(body).not.toMatch(/Prisma/i);
  });

  it('P19 confirmation-review fix: strips `detail` from any 5xx AppError, even one a call site builds WITH a detail string', async () => {
    const app = buildApp((a) =>
      a.get('/leaky-500', () => {
        // internal()/serviceUnavailable() accept an optional detail; every current call site
        // passes none, but the handler must not rely on that convention holding forever.
        throw internal('should never reach the client');
      }),
    );

    const res = await request(app).get('/leaky-500');

    expect(res.status).toBe(500);
    expect(res.body.detail).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('should never reach the client');
  });

  it('never leaks a stack trace or the raw message for an unexpected error', async () => {
    const app = buildApp((a) =>
      a.get('/crash', () => {
        throw new Error('super secret internal detail');
      }),
    );

    const res = await request(app).get('/crash');

    expect(res.status).toBe(500);
    expect(res.body.type).toBe('internal-error');
    expect(JSON.stringify(res.body)).not.toContain('super secret internal detail');
    expect(res.body.detail).toBeUndefined();
  });

  it('renders 413 payload-too-large when the body exceeds the configured limit', async () => {
    const app = buildApp((a) => a.post('/echo', (req, res) => res.json(req.body)), '10b');

    const res = await request(app).post('/echo').send({ text: 'this body is longer than ten bytes' });

    expect(res.status).toBe(413);
    expect(res.body.type).toBe('payload-too-large');
  });

  it('renders 400 bad-request for malformed JSON', async () => {
    const app = buildApp((a) => a.post('/echo', (req, res) => res.json(req.body)));

    const res = await request(app).post('/echo').set('Content-Type', 'application/json').send('{not valid json');

    expect(res.status).toBe(400);
    expect(res.body.type).toBe('bad-request');
  });

  it('renders 404 not-found (application/problem+json) for an unmatched route', async () => {
    const app = buildApp(() => undefined);

    const res = await request(app).get('/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body.type).toBe('not-found');
    expect(res.body.instance).toBe('/does-not-exist');
  });
});
