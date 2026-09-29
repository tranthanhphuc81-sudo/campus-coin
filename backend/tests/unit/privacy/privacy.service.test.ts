/**
 * privacy.service.test.ts
 * Unit tests for `requestAccountDeletion`'s security-critical ordering and resilience (security
 * review Fix 1-3, `modules/privacy/privacy.service.ts`): every repository/side-effect dependency is
 * mocked so these run without DB/Redis, and can assert call ORDER precisely.
 * Spec: docs/spec/09 §9.14 (right to erasure)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findByIdMock = vi.fn();
vi.mock('../../../src/modules/users/users.repository.js', () => ({ usersRepository: { findById: findByIdMock } }));

const verifyPasswordMock = vi.fn();
vi.mock('../../../src/lib/password.js', () => ({ verifyPassword: verifyPasswordMock }));

const recordFailedAttemptMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../src/modules/auth/auth.service.js', () => ({ recordFailedAttempt: recordFailedAttemptMock }));

const invalidateUnusedTokensMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../src/modules/auth/auth.repository.js', () => ({
  authRepository: { invalidateUnusedTokens: invalidateUnusedTokensMock },
}));

const recordMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../src/modules/audit/audit.service.js', () => ({ record: recordMock }));

const revokeAllSessionsMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../src/modules/sessions/session.service.js', () => ({ revokeAllSessions: revokeAllSessionsMock }));

const requestDeletionMock = vi.fn().mockResolvedValue({ count: 1 });
vi.mock('../../../src/modules/privacy/privacy.repository.js', () => ({
  privacyRepository: { requestDeletion: requestDeletionMock },
}));

const queueEmailMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../src/integrations/mailer/index.js', () => ({ queueEmail: queueEmailMock }));

const { requestAccountDeletion } = await import('../../../src/modules/privacy/privacy.service.js');

const USER_ID = 'user-1';

function fakeUser(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: USER_ID,
    email: 'student@example.com',
    fullName: 'Student One',
    passwordHash: 'hash',
    lockedUntil: null,
    ...overrides,
  };
}

describe('requestAccountDeletion (security-fix regression)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findByIdMock.mockResolvedValue(fakeUser());
    verifyPasswordMock.mockResolvedValue(true);
    requestDeletionMock.mockResolvedValue({ count: 1 });
    revokeAllSessionsMock.mockResolvedValue(undefined);
    invalidateUnusedTokensMock.mockResolvedValue(undefined);
    recordMock.mockResolvedValue(undefined);
    queueEmailMock.mockResolvedValue(undefined);
  });

  it('Fix 2: flips status/deletedAt (privacyRepository.requestDeletion) BEFORE revoking sessions/tokens', async () => {
    const order: string[] = [];
    requestDeletionMock.mockImplementation(async () => {
      order.push('disable');
      return { count: 1 };
    });
    revokeAllSessionsMock.mockImplementation(async () => {
      order.push('revokeSessions');
    });
    invalidateUnusedTokensMock.mockImplementation(async () => {
      order.push('invalidateTokens');
    });

    await requestAccountDeletion(USER_ID, 'irrelevant-Password1');

    // The disable write is the very first side effect; revoke/invalidate only happen after it
    // (previously: revoke-then-disable left a brief window where a new login/refresh in between
    // was never revoked).
    expect(order).toEqual(['disable', 'revokeSessions', 'invalidateTokens', 'invalidateTokens']);
  });

  it('Fix 1: writes the user.delete.requested audit row BEFORE calling queueEmail, and still resolves (202-equivalent) when queueEmail rejects', async () => {
    const order: string[] = [];
    recordMock.mockImplementation(async (input: { action: string }) => {
      order.push(`record:${input.action}`);
    });
    queueEmailMock.mockImplementation(async () => {
      order.push('queueEmail');
      throw new Error('redis down');
    });

    const result = await requestAccountDeletion(USER_ID, 'irrelevant-Password1');

    // The caller (controller) still gets its result — and therefore its 202 — even though the
    // queued email rejected.
    expect(result.scheduledPurgeAt).toBeInstanceOf(Date);
    expect(recordMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.delete.requested', actorId: USER_ID, entityId: USER_ID }),
    );
    // The audit row is written BEFORE the email is even attempted — a Redis-down queueEmail can
    // never cost this irreversible action its audit trail.
    expect(order).toEqual(['record:user.delete.requested', 'queueEmail']);
  });

  it('Fix 3: the queued email jobId is suffixed with a timestamp, never the fixed `account-delete-<userId>` shape', async () => {
    await requestAccountDeletion(USER_ID, 'irrelevant-Password1');

    expect(queueEmailMock).toHaveBeenCalledTimes(1);
    const call = queueEmailMock.mock.calls[0]![0] as { jobId: string };
    expect(call.jobId).toMatch(new RegExp(`^account-delete-${USER_ID}-\\d+$`));
    expect(call.jobId).not.toBe(`account-delete-${USER_ID}`);
    expect(call.jobId.split(':')).toHaveLength(1); // no bare ':' (BullMQ jobId gotcha).
  });
});
