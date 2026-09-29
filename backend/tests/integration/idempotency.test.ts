/**
 * idempotency.test.ts
 * Integration test for backend/src/lib/idempotency.ts against a real Redis (skipped when
 * REDIS_URL is not set — same convention as tests/integration/db/seed.test.ts). Verifies a
 * repeated `Idempotency-Key` replays the exact first response instead of re-running the handler,
 * and the B-L4 fixes: an invalid key format is rejected (422), a reused key with a different body
 * is NOT treated as a replay, and two concurrent requests with the same key/body race safely (the
 * second gets 409, never a duplicate write).
 * Spec: docs/spec/07 §7.1 (Table 40 – Idempotency)
 */
import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../src/middlewares/errorHandler.js';
import { idempotency } from '../../src/lib/idempotency.js';
import { redis } from '../../src/lib/redis.js';

describe.skipIf(!process.env.REDIS_URL)('idempotency middleware', () => {
  afterAll(async () => {
    await redis.quit();
  });

  function buildApp(handler: ReturnType<typeof vi.fn<() => void>>) {
    const app = express();
    app.use(express.json()); // idempotency hashes req.body — must run after body parsing, as in the real app.
    app.use(idempotency);
    app.post('/orders', (req, res) => {
      handler();
      res.status(201).json({ id: randomUUID() });
    });
    app.use(errorHandler);
    return app;
  }

  it('runs the handler once and replays the same response for a repeated key', async () => {
    const handler = vi.fn<() => void>();
    const app = buildApp(handler);
    const key = `test-${randomUUID()}`;

    const first = await request(app).post('/orders').set('Idempotency-Key', key).send({});
    const second = await request(app).post('/orders').set('Idempotency-Key', key).send({});

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('runs the handler again when no Idempotency-Key is sent', async () => {
    const handler = vi.fn<() => void>();
    const app = buildApp(handler);

    await request(app).post('/orders').send({});
    await request(app).post('/orders').send({});

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('treats different keys as different requests', async () => {
    const handler = vi.fn<() => void>();
    const app = buildApp(handler);

    const first = await request(app).post('/orders').set('Idempotency-Key', `a-${randomUUID()}`).send({});
    const second = await request(app).post('/orders').set('Idempotency-Key', `b-${randomUUID()}`).send({});

    expect(first.body).not.toEqual(second.body);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('B-L4: rejects a malformed Idempotency-Key header with 422 instead of silently using it', async () => {
    const handler = vi.fn<() => void>();
    const app = buildApp(handler);

    const res = await request(app).post('/orders').set('Idempotency-Key', 'short').send({});

    expect(res.status).toBe(422);
    expect(handler).not.toHaveBeenCalled();
  });

  it('B-L4: the same key reused on a request with a DIFFERENT body is not treated as a replay of the first', async () => {
    const handler = vi.fn<() => void>();
    const app = buildApp(handler);
    const key = `test-${randomUUID()}`;

    const first = await request(app).post('/orders').set('Idempotency-Key', key).send({ item: 'A' });
    const second = await request(app).post('/orders').set('Idempotency-Key', key).send({ item: 'B' });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).not.toEqual(first.body); // a fresh id, not A's replayed response.
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('B-L4: two concurrent requests with the same key/body race safely — the second gets 409, not a duplicate write', async () => {
    let handlerRuns = 0;
    let resolveFirst: (() => void) | undefined;
    let resolveHandlerStarted: (() => void) | undefined;
    const firstMayRespond = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const handlerStarted = new Promise<void>((resolve) => {
      resolveHandlerStarted = resolve;
    });

    const app = express();
    app.use(express.json());
    app.use(idempotency);
    app.post('/orders', (_req, res) => {
      handlerRuns += 1;
      resolveHandlerStarted!(); // signals the in-flight lock is now held, before the handler finishes.
      firstMayRespond.then(() => res.status(201).json({ id: randomUUID() })).catch(() => undefined);
    });
    app.use(errorHandler);

    const key = `test-${randomUUID()}`;
    // `.end()` dispatches immediately (unlike a plain `await`, which supertest only sends the
    // request once awaited/`.then`-ed) — required so `first` is genuinely in flight while we wait
    // below and then fire `second` concurrently.
    const first = new Promise<{ status: number }>((resolve, reject) => {
      request(app)
        .post('/orders')
        .set('Idempotency-Key', key)
        .send({})
        .end((err, res) => (err ? reject(err) : resolve(res)));
    });
    await handlerStarted; // deterministic: wait for the first request to actually claim the lock.
    const second = await request(app).post('/orders').set('Idempotency-Key', key).send({});

    expect(second.status).toBe(409);
    resolveFirst!();
    const firstRes = await first;
    expect(firstRes.status).toBe(201);
    expect(handlerRuns).toBe(1); // the handler itself only ever ran once.
  });
});
