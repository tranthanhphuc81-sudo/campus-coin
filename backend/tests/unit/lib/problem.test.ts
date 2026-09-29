/**
 * problem.test.ts
 * Unit tests for the RFC 9457 error factories (backend/src/lib/problem.ts): correct status/type
 * per docs/spec/07 Table 41, and that `validationFailed`/`rateLimited` carry their extra fields.
 * Spec: docs/spec/07 §7.2 (Table 41)
 */
import { describe, expect, it } from 'vitest';
import {
  AppError,
  badRequest,
  conflict,
  forbidden,
  internal,
  notFound,
  payloadTooLarge,
  rateLimited,
  serviceUnavailable,
  unauthenticated,
  unsupportedMediaType,
  validationFailed,
  versionMismatch,
} from '../../../src/lib/problem.js';

describe('problem factories', () => {
  it.each([
    [badRequest(), 400, 'bad-request'],
    [unauthenticated(), 401, 'unauthenticated'],
    [unauthenticated(undefined, 'token-expired'), 401, 'token-expired'],
    [forbidden(), 403, 'forbidden'],
    [notFound(), 404, 'not-found'],
    [conflict(), 409, 'conflict'],
    [versionMismatch(), 409, 'version-mismatch'],
    [payloadTooLarge(), 413, 'payload-too-large'],
    [unsupportedMediaType(), 415, 'unsupported-media-type'],
    [internal(), 500, 'internal-error'],
    [serviceUnavailable(), 503, 'service-unavailable'],
  ] as const)('%o maps to status %d and type %s', (error, status, type) => {
    expect(error).toBeInstanceOf(AppError);
    expect(error.status).toBe(status);
    expect(error.type).toBe(type);
    expect(error.title).toBeTruthy();
  });

  it('validationFailed carries field errors and status 422', () => {
    const error = validationFailed([{ field: 'email', message: 'Invalid email' }]);
    expect(error.status).toBe(422);
    expect(error.type).toBe('validation-failed');
    expect(error.errors).toEqual([{ field: 'email', message: 'Invalid email' }]);
  });

  it('rateLimited carries retryAfter and status 429', () => {
    const error = rateLimited(42);
    expect(error.status).toBe(429);
    expect(error.type).toBe('rate-limited');
    expect(error.retryAfter).toBe(42);
  });

  it('never puts internal detail where the client would see it by default', () => {
    const error = internal();
    expect(error.detail).toBeUndefined();
  });
});
