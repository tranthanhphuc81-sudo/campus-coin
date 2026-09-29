/**
 * authSchemas.test.ts
 * Unit tests for shared/src/schemas/auth.ts (consumed here via @campuscoin/shared, exactly as
 * the backend controllers will): strict schemas reject unknown fields (mass-assignment), email
 * normalisation, fullName HTML-tag stripping, control-character rejection (C-L4), and timezone
 * validation.
 * Spec: docs/spec/09 §9 (auth) · Rules: BR-AU-01, BR-AU-02 · docs/security/review-p19.md C-L4
 */
import {
  emailSchema,
  loginSchema,
  mfaVerifySchema,
  registerSchema,
  updateProfileSchema,
} from '@campuscoin/shared';
import { describe, expect, it } from 'vitest';

describe('emailSchema', () => {
  it('trims and lower-cases a valid address', () => {
    expect(emailSchema.parse('  Foo@Bar.COM  ')).toBe('foo@bar.com');
  });

  it('rejects an invalid address', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
  });
});

describe('registerSchema (strict)', () => {
  it('accepts a valid payload', () => {
    const result = registerSchema.safeParse({ fullName: 'Jane Doe', email: 'jane@example.com', password: 'longenoughpw' });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown field such as role (mass-assignment)', () => {
    const result = registerSchema.safeParse({
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      password: 'longenoughpw',
      role: 'admin',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a password shorter than the minimum length', () => {
    const result = registerSchema.safeParse({ fullName: 'Jane Doe', email: 'jane@example.com', password: 'short1' });
    expect(result.success).toBe(false);
  });

  // C-L4: a fullName with embedded control characters (e.g. CR/LF) can inject fake paragraph
  // breaks into the plaintext part of an email built from it (the shared-report greeting).
  it('rejects a fullName containing control characters', () => {
    const result = registerSchema.safeParse({
      fullName: 'Jane\r\nDoe',
      email: 'jane@example.com',
      password: 'longenoughpw',
    });
    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('defaults rememberMe to false and does not enforce the password policy', () => {
    const result = loginSchema.parse({ email: 'jane@example.com', password: 'x' });
    expect(result).toEqual({ email: 'jane@example.com', password: 'x', rememberMe: false });
  });

  it('rejects an unknown field', () => {
    expect(loginSchema.safeParse({ email: 'jane@example.com', password: 'x', status: 'active' }).success).toBe(false);
  });
});

describe('mfaVerifySchema', () => {
  // mfaToken is a compact JWT (lib/jwt.ts signMfaToken), not an opaque link token.
  const mfaToken = `${'a'.repeat(20)}.${'b'.repeat(20)}.${'c'.repeat(20)}`;

  it('accepts exactly one of code / recoveryCode', () => {
    expect(mfaVerifySchema.safeParse({ mfaToken, code: '123456' }).success).toBe(true);
    expect(mfaVerifySchema.safeParse({ mfaToken, recoveryCode: 'abcde-fghjk' }).success).toBe(true);
  });

  it('rejects when both or neither are present', () => {
    expect(mfaVerifySchema.safeParse({ mfaToken }).success).toBe(false);
    expect(mfaVerifySchema.safeParse({ mfaToken, code: '123456', recoveryCode: 'abcde-fghjk' }).success).toBe(false);
  });
});

describe('updateProfileSchema', () => {
  it('strips HTML tags from fullName', () => {
    const result = updateProfileSchema.parse({ fullName: '<b>Jane</b> Doe' });
    expect(result.fullName).toBe('Jane Doe');
  });

  it('rejects an invalid IANA timezone', () => {
    expect(updateProfileSchema.safeParse({ timezone: 'Not/AZone' }).success).toBe(false);
  });

  it('accepts a valid timezone and money-like fields', () => {
    const result = updateProfileSchema.safeParse({
      timezone: 'Asia/Ho_Chi_Minh',
      monthlyAllowanceBaseline: '250.00',
      monthlySavingsGoal: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown field such as userId (mass-assignment)', () => {
    expect(updateProfileSchema.safeParse({ userId: 'someone-elses-id' }).success).toBe(false);
  });

  // C-L4: same control-character rejection as registerSchema.fullName — a profile edit is another
  // path a display name reaches the shared-report email's greeting.
  it('rejects a fullName containing control characters', () => {
    expect(updateProfileSchema.safeParse({ fullName: 'Jane\x00Doe' }).success).toBe(false);
  });
});
