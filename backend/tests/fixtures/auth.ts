/**
 * auth.ts (fixtures)
 * Shared helpers for the `tests/integration/auth/*` suite: unique test emails, a ready-made
 * active user (bypassing registration), cleanup of everything created, and a Redis `rl:*`
 * flush so rate-limit counters from a previous test never leak into the next one.
 * Spec: docs/spec/12 (testing plan)
 */
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../../src/lib/password.js';
import { prisma } from '../../src/lib/prisma.js';
import { redis } from '../../src/lib/redis.js';

/** A syntactically valid, guaranteed-unique test email (never collides across test runs). */
export function uniqueEmail(prefix = ''): string {
  return `${prefix}${randomUUID()}@test.local`;
}

/**
 * Email prefix for tests that assert a real rate-limit 429 (e.g. TC-28): keys containing it are
 * never flushed by {@link flushRateLimits}, so another test file running in parallel cannot
 * reset the counter mid-test.
 */
export const KEEP_RATE_LIMIT_PREFIX = 'rl-keep-';

/** A password that satisfies length + policy checks (not in the common-password wordlist). */
export const STRONG_PASSWORD = 'zQ7!vBn4pR9x-Wolverine';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  fullName: string;
}

const createdUserIds: string[] = [];

/** Creates an already-active, already-verified user directly in the DB (bypasses `/auth/register`). */
export async function createActiveUser(
  overrides: Partial<{ email: string; password: string; fullName: string }> = {},
): Promise<TestUser> {
  const email = overrides.email ?? uniqueEmail();
  const password = overrides.password ?? STRONG_PASSWORD;
  const fullName = overrides.fullName ?? 'Test Student';
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, passwordHash, fullName, status: 'active', emailVerifiedAt: new Date() },
  });
  createdUserIds.push(user.id);
  return { id: user.id, email, password, fullName };
}

/** Registers `userId` for cleanup even when it was created outside {@link createActiveUser} (e.g. via `/auth/register`). */
export function trackUserForCleanup(userId: string): void {
  createdUserIds.push(userId);
}

/**
 * Deletes every user tracked by this fixture module. Sessions/auth tokens cascade automatically,
 * but `Category`/`Transaction`/`RecurringRule`/`ImportBatch` have a `RESTRICT` FK to `User` (P07/
 * P11), so anything a test user owns there must be deleted first, in FK-safe order, before the
 * user itself.
 */
export async function cleanupTestUsers(): Promise<void> {
  if (createdUserIds.length === 0) return;
  const where = { userId: { in: createdUserIds } };
  // Budget's FK to User is `onDelete: Restrict` (P09), so it must be deleted before the user, same
  // as the P07 rows below. Notification's FK is `onDelete: Cascade` (not strictly required here),
  // but it is deleted explicitly too for ordering clarity.
  await prisma.budget.deleteMany({ where });
  await prisma.notification.deleteMany({ where });
  await prisma.transactionHistory.deleteMany({ where });
  await prisma.transaction.deleteMany({ where });
  // Transaction.importBatchId -> ImportBatch is `onDelete: Restrict` (P11): every transaction
  // referencing a batch must be gone (the delete above) before the batch itself can be deleted.
  await prisma.importBatch.deleteMany({ where });
  await prisma.recurringRule.deleteMany({ where });
  await prisma.category.deleteMany({ where });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  createdUserIds.length = 0;
}

/**
 * Flushes the auth rate-limit counters (`rl:auth-*`, `rl:admin-*`) so a previous test's limits
 * never leak into the next. Test files run in parallel against one Redis, so this deliberately
 * spares ad-hoc limiters (`rl:test-*` in rateLimit.test.ts) and keys marked with
 * {@link KEEP_RATE_LIMIT_PREFIX} — both belong to tests that assert a 429.
 */
export async function flushRateLimits(): Promise<void> {
  const keys = [...(await redis.keys('rl:auth-*')), ...(await redis.keys('rl:admin-*'))].filter(
    (key) => !key.includes(KEEP_RATE_LIMIT_PREFIX),
  );
  if (keys.length > 0) await redis.del(...keys);
}
