/**
 * admin-users.service.test.ts
 * Unit test for `admin-users.service.disable` (A-L8): sessions must be revoked BOTH before and
 * after the `status` flip to `DISABLED`, closing the race window where a login completing between
 * the first revoke and the status update would otherwise keep a valid session/access token alive.
 * Mocks every dependency so this asserts call order without a real DB/Redis.
 * Spec: docs/spec/05c §5.13 · Rules: BR-AU-08
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const revokeAllSessionsMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../src/modules/sessions/session.service.js', () => ({
  revokeAllSessions: revokeAllSessionsMock,
}));

const findByIdMock = vi.fn();
const setStatusMock = vi.fn().mockResolvedValue({ count: 1 });
vi.mock('../../../src/modules/admin-users/admin-users.repository.js', () => ({
  adminUsersRepository: {
    findById: findByIdMock,
    setStatus: setStatusMock,
  },
}));

const invalidateUnusedTokensMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../src/modules/auth/auth.repository.js', () => ({
  authRepository: { invalidateUnusedTokens: invalidateUnusedTokensMock },
}));

const recordMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../src/modules/audit/audit.service.js', () => ({ record: recordMock }));

const { disable } = await import('../../../src/modules/admin-users/admin-users.service.js');

describe('admin-users.service.disable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findByIdMock.mockResolvedValue({ id: 'user-1' });
    setStatusMock.mockResolvedValue({ count: 1 });
  });

  it('A-L8: revokes sessions once before setStatus and once again after it', async () => {
    const callOrder: string[] = [];
    revokeAllSessionsMock.mockImplementation(async () => {
      callOrder.push('revoke');
    });
    setStatusMock.mockImplementation(async () => {
      callOrder.push('setStatus');
      return { count: 1 };
    });

    await disable('user-1', { userId: 'admin-1', role: 'admin' });

    expect(revokeAllSessionsMock).toHaveBeenCalledTimes(2);
    expect(revokeAllSessionsMock).toHaveBeenNthCalledWith(1, 'user-1');
    expect(revokeAllSessionsMock).toHaveBeenNthCalledWith(2, 'user-1');
    // Exactly one revoke happened before setStatus and one after (order-independent among the
    // first-batch Promise.all calls, but the second revoke must always be last).
    expect(callOrder[callOrder.length - 1]).toBe('revoke');
    expect(callOrder.indexOf('setStatus')).toBeGreaterThan(callOrder.indexOf('revoke'));
  });

  it('404s when the target id is not a (student) user, without revoking any session', async () => {
    findByIdMock.mockResolvedValue(null);

    await expect(disable('missing', { userId: 'admin-1', role: 'admin' })).rejects.toMatchObject({ status: 404 });
    expect(revokeAllSessionsMock).not.toHaveBeenCalled();
    expect(setStatusMock).not.toHaveBeenCalled();
  });
});
