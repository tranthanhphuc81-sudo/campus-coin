/**
 * maskEmail.test.ts
 * Unit tests for `maskEmail` (P15 admin user list masking).
 * Spec: docs/spec/05c §5.13
 */
import { describe, expect, it } from 'vitest';
import { maskEmail } from '../../../src/lib/maskEmail.js';

describe('maskEmail', () => {
  it('keeps the first 2 local-part characters and masks the rest', () => {
    expect(maskEmail('annguyen@campuscoin.demo')).toBe('an***@campuscoin.demo');
  });

  it('keeps a single-character local part as-is before the mask', () => {
    expect(maskEmail('a@x.com')).toBe('a***@x.com');
  });

  it('preserves a "+" tag in the local part when only the first 2 characters are kept', () => {
    expect(maskEmail('jo+test@example.com')).toBe('jo***@example.com');
  });

  it('handles an empty local part gracefully', () => {
    expect(maskEmail('@example.com')).toBe('***@example.com');
  });

  it('returns the input unchanged when there is no "@"', () => {
    expect(maskEmail('not-an-email')).toBe('not-an-email');
  });

  // Fix 6 boundary cases: a <=3 char local part must show only its first character (never the
  // whole thing unmasked); a 4+ char local part shows its first 2, same as before.
  it('keeps only the first character of a 2-character local part (never the whole thing unmasked)', () => {
    expect(maskEmail('ab@x.com')).toBe('a***@x.com');
  });

  it('keeps only the first character of an exactly-3-character local part', () => {
    expect(maskEmail('abc@x.com')).toBe('a***@x.com');
  });

  it('keeps the first 2 characters of an exactly-4-character local part', () => {
    expect(maskEmail('abcd@x.com')).toBe('ab***@x.com');
  });
});
