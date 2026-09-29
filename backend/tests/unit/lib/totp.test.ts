/**
 * totp.test.ts
 * Unit tests for backend/src/lib/totp.ts: secret/URI generation, correct-code acceptance, wrong
 * code rejection, and the `afterTimeStep` replay guard.
 * Spec: docs/spec/09 §9.5 (MFA row) · Rules: BR-AU-09
 */
import { describe, expect, it } from 'vitest';
import { generate } from 'otplib';
import { buildOtpauthUrl, generateTotpSecret, TOTP_PERIOD_SEC, verifyTotp } from '../../../src/lib/totp.js';

describe('generateTotpSecret', () => {
  it('produces a unique Base32 secret each call', () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Z2-7]+$/);
  });
});

describe('buildOtpauthUrl', () => {
  it('embeds the fixed CampusCoin issuer and the account email', () => {
    const url = buildOtpauthUrl('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', 'admin@campuscoin.local');
    expect(url).toMatch(/^otpauth:\/\/totp\//);
    expect(url).toContain('CampusCoin');
    expect(url).toContain(encodeURIComponent('admin@campuscoin.local'));
  });
});

describe('verifyTotp', () => {
  it('accepts the current code for the secret', async () => {
    const secret = generateTotpSecret();
    const code = await generate({ secret });
    const result = await verifyTotp(secret, code);
    expect(result.valid).toBe(true);
    expect(typeof result.timeStep).toBe('number');
  });

  it('rejects a wrong code', async () => {
    const secret = generateTotpSecret();
    const code = await generate({ secret });
    const wrong = code === '000000' ? '111111' : '000000';
    const result = await verifyTotp(secret, wrong);
    expect(result.valid).toBe(false);
    expect(result.timeStep).toBeUndefined();
  });

  it('rejects a code whose time step is at or before `afterTimeStep` (replay protection)', async () => {
    const secret = generateTotpSecret();
    const code = await generate({ secret });
    const first = await verifyTotp(secret, code);
    expect(first.valid).toBe(true);

    // Replaying the exact same code, now claiming the last accepted step, must be rejected.
    const replay = await verifyTotp(secret, code, first.timeStep);
    expect(replay.valid).toBe(false);
  });

  it('accepts a code from the next time step after a replay guard on the previous one', async () => {
    const secret = generateTotpSecret();
    const now = Math.floor(Date.now() / 1000);
    const previousStep = Math.floor(now / TOTP_PERIOD_SEC) - 1;
    const code = await generate({ secret });
    const result = await verifyTotp(secret, code, previousStep);
    expect(result.valid).toBe(true);
  });
});
