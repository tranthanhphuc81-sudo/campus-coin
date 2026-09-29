/**
 * passwordPolicy.test.ts
 * Unit tests for backend/src/lib/passwordPolicy.ts: length checks, common-password blocklist
 * (real wordlist entries), "contains email", and HIBP (mocked via a stubbed global `fetch`) —
 * breached (deterministic: the mock response is built from the test password's own SHA-1 suffix),
 * clean, timeout/error (fails open), and disabled (never calls fetch).
 * Spec: docs/spec/09 §9.2 (password policy) · Rules: BR-AU-02
 */
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkPasswordPolicy, isCommonPassword } from '../../../src/lib/passwordPolicy.js';
import { config } from '../../../src/config/env.js';

/** SHA-1 upper-case hex digest, mirroring passwordPolicy.ts's own `sha1Hex`. */
function sha1Hex(value: string): string {
  return createHash('sha1').update(value, 'utf8').digest('hex').toUpperCase();
}

describe('isCommonPassword', () => {
  it('flags a real wordlist entry (>= 10 chars)', async () => {
    await expect(isCommonPassword('basketball')).resolves.toBe(true);
    await expect(isCommonPassword('BASKETBALL')).resolves.toBe(true); // case-insensitive
  });

  it('does not flag a random long password', async () => {
    await expect(isCommonPassword('zX9!qwLp4mVr2s')).resolves.toBe(false);
  });
});

describe('checkPasswordPolicy', () => {
  const originalHibpEnabled = config.auth.hibpEnabled;

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    (config.auth as { hibpEnabled: boolean }).hibpEnabled = originalHibpEnabled;
  });

  it('rejects a too-short password', async () => {
    await expect(checkPasswordPolicy('short1')).resolves.toEqual({ ok: false, reason: 'too_short' });
  });

  it('rejects a too-long password', async () => {
    await expect(checkPasswordPolicy('a'.repeat(129))).resolves.toEqual({ ok: false, reason: 'too_long' });
  });

  it('rejects a password containing the account email local-part', async () => {
    (config.auth as { hibpEnabled: boolean }).hibpEnabled = false;
    const result = await checkPasswordPolicy('janedoe12345', { email: 'janedoe@example.com' });
    expect(result).toEqual({ ok: false, reason: 'contains_email' });
  });

  it('rejects a common password from the wordlist', async () => {
    (config.auth as { hibpEnabled: boolean }).hibpEnabled = false;
    await expect(checkPasswordPolicy('basketball')).resolves.toEqual({ ok: false, reason: 'common' });
  });

  it('flags a breached password via HIBP (mocked fetch)', async () => {
    (config.auth as { hibpEnabled: boolean }).hibpEnabled = true;
    const password = 'zX9!qwLp4mVrUniq';
    const digest = sha1Hex(password);
    const suffix = digest.slice(5);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(`${suffix}:5\nBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB:0`),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkPasswordPolicy(password);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`https://api.pwnedpasswords.com/range/${digest.slice(0, 5)}`);
    expect(result).toEqual({ ok: false, reason: 'breached' });
  });

  it('treats a clean HIBP response as not breached', async () => {
    (config.auth as { hibpEnabled: boolean }).hibpEnabled = true;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('') }));
    await expect(checkPasswordPolicy('zX9!qwLp4mVrUniq')).resolves.toEqual({ ok: true });
  });

  it('fails open when HIBP times out / errors', async () => {
    (config.auth as { hibpEnabled: boolean }).hibpEnabled = true;
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    await expect(checkPasswordPolicy('zX9!qwLp4mVrUniq')).resolves.toEqual({ ok: true });
  });

  it('never calls fetch when HIBP is disabled', async () => {
    (config.auth as { hibpEnabled: boolean }).hibpEnabled = false;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(checkPasswordPolicy('zX9!qwLp4mVrUniq')).resolves.toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
