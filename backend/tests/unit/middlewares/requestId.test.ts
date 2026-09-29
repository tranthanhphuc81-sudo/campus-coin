/**
 * requestId.test.ts
 * Unit tests for backend/src/middlewares/requestId.ts (A-L2): a well-formed client-supplied
 * `X-Request-Id` is echoed back verbatim; a malformed one (wrong length/characters) is replaced
 * with a fresh generated id instead of being trusted into logs/responses unvalidated.
 * Spec: docs/spec/07 §7.1 (Table 40)
 */
import express, { type Express } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { requestId } from '../../../src/middlewares/requestId.js';

function buildApp(): Express {
  const app = express();
  app.use(requestId);
  app.get('/ping', (req, res) => res.json({ id: req.id }));
  return app;
}

describe('requestId', () => {
  it('generates a fresh id when no header is supplied', async () => {
    const res = await request(buildApp()).get('/ping');
    expect(res.headers['x-request-id']).toBeTruthy();
    expect(res.body.id).toBe(res.headers['x-request-id']);
  });

  it('echoes back a well-formed client-supplied X-Request-Id', async () => {
    const res = await request(buildApp()).get('/ping').set('X-Request-Id', 'client-supplied-id-123');
    expect(res.headers['x-request-id']).toBe('client-supplied-id-123');
  });

  it('A-L2: rejects a too-short id and generates a fresh one instead', async () => {
    const res = await request(buildApp()).get('/ping').set('X-Request-Id', 'short');
    expect(res.headers['x-request-id']).not.toBe('short');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('A-L2: rejects an id containing characters outside [A-Za-z0-9-] and generates a fresh one', async () => {
    const malformed = 'not a valid id!!';
    const res = await request(buildApp()).get('/ping').set('X-Request-Id', malformed);
    expect(res.headers['x-request-id']).not.toBe(malformed);
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('A-L2: rejects an oversized id (>64 chars) and generates a fresh one', async () => {
    const res = await request(buildApp()).get('/ping').set('X-Request-Id', 'a'.repeat(200));
    expect((res.headers['x-request-id'] as string).length).toBeLessThanOrEqual(64);
  });
});
