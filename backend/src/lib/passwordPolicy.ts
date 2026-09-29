/**
 * passwordPolicy.ts
 * Server-side password policy checks that need I/O and can't live in the shared Zod schema:
 * common-password blocklist, "contains the user's email", and an optional HaveIBeenPwned (HIBP)
 * k-anonymity breach check. Called by the register/change-password/reset-password services
 * (later blocks) after `passwordSchema` (length) has already passed — BR-AU-02.
 * Main exports: checkPasswordPolicy, isCommonPassword
 * Spec: docs/spec/09 §9.2 (password policy) · Rules: BR-AU-02
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, HIBP_TIMEOUT_MS } from '@campuscoin/shared';
import { config } from '../config/env.js';
import { logger } from './logger.js';

/** Why a password was rejected by {@link checkPasswordPolicy}. */
export type PasswordPolicyFailureReason = 'too_short' | 'too_long' | 'common' | 'breached' | 'contains_email';

/** Result of {@link checkPasswordPolicy}: either accepted, or rejected with a reason. */
export type PasswordPolicyResult = { ok: true } | { ok: false; reason: PasswordPolicyFailureReason };

// backend/data/common-passwords.txt sits two levels above this file both in `src/lib` and in the
// built `dist/lib` (backend/{src,dist}/lib/../../data), so the same relative path resolves in both.
const WORDLIST_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'common-passwords.txt');

let commonPasswords: Promise<ReadonlySet<string>> | undefined;

/** Loads (once, lazily) the common-password wordlist into a lower-cased `Set` for O(1) lookup. */
function loadCommonPasswords(): Promise<ReadonlySet<string>> {
  commonPasswords ??= readFile(WORDLIST_PATH, 'utf8').then(
    (text) => new Set(text.split(/\r?\n/).map((line) => line.trim().toLowerCase()).filter(Boolean)),
  );
  return commonPasswords;
}

/**
 * Tells whether `password` (case-insensitive) appears in the common-password wordlist.
 * @param password - Plaintext password to check.
 */
export async function isCommonPassword(password: string): Promise<boolean> {
  const set = await loadCommonPasswords();
  return set.has(password.toLowerCase());
}

/** SHA-1 upper-case hex digest, as required by the HIBP range API. */
function sha1Hex(value: string): string {
  return createHash('sha1').update(value, 'utf8').digest('hex').toUpperCase();
}

/**
 * Checks `password` against the HaveIBeenPwned k-anonymity range API. Never blocks the caller on
 * a slow/failed/disabled lookup: any error, timeout or non-200 response is treated as "not
 * breached" (BR-AU-02: availability of a third party must never prevent signup/login).
 * @param password - Plaintext password to check.
 * @returns true when the password's SHA-1 suffix appears in the breach corpus with count > 0.
 */
async function isBreached(password: string): Promise<boolean> {
  if (!config.auth.hibpEnabled) return false;
  const digest = sha1Hex(password);
  const prefix = digest.slice(0, 5);
  const suffix = digest.slice(5);
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(HIBP_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const body = await res.text();
    for (const line of body.split('\n')) {
      const [lineSuffix, count] = line.trim().split(':');
      if (lineSuffix === suffix) return Number(count) > 0;
    }
    return false;
  } catch (err) {
    logger.debug({ err }, 'HIBP lookup failed or timed out; treating password as not breached');
    return false;
  }
}

/**
 * Runs the full server-side password policy: length, common-password blocklist, "contains the
 * account email", then (if enabled) HIBP breach check. Order matters: cheap/local checks first,
 * so a common password never triggers a network call.
 * @param password - Plaintext candidate password.
 * @param context - Optional context; `email` is used for the "contains email" check.
 */
export async function checkPasswordPolicy(
  password: string,
  context: { email?: string } = {},
): Promise<PasswordPolicyResult> {
  if (password.length < PASSWORD_MIN_LENGTH) return { ok: false, reason: 'too_short' };
  if (password.length > PASSWORD_MAX_LENGTH) return { ok: false, reason: 'too_long' };

  const localPart = context.email?.split('@')[0]?.toLowerCase();
  if (localPart && localPart.length >= 3 && password.toLowerCase().includes(localPart)) {
    return { ok: false, reason: 'contains_email' };
  }

  if (await isCommonPassword(password)) return { ok: false, reason: 'common' };
  if (await isBreached(password)) return { ok: false, reason: 'breached' };

  return { ok: true };
}
