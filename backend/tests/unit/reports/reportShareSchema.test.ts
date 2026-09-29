/**
 * reportShareSchema.test.ts
 * Unit tests for shared/src/schemas/report.ts's `reportShareSchema.message` field (consumed here
 * via @campuscoin/shared, exactly as the backend controller will): rejects a URL-shaped message
 * (mail clients auto-link it — phishing vector from CampusCoin's own trusted sending domain) and a
 * message with embedded control characters (fake plaintext paragraph breaks).
 * Spec: docs/spec/05b §5.8 · docs/security/review-p19.md C-L4/B-L7
 */
import { reportShareSchema } from '@campuscoin/shared';
import { describe, expect, it } from 'vitest';

describe('reportShareSchema.message', () => {
  it('accepts a plain message with no link', () => {
    const result = reportShareSchema.safeParse({ toEmail: 'parent@example.com', message: 'Here is my spending for the month!' });
    expect(result.success).toBe(true);
  });

  it('rejects a message containing an http(s):// URL', () => {
    const result = reportShareSchema.safeParse({ toEmail: 'parent@example.com', message: 'Check this out: https://evil.example/phish' });
    expect(result.success).toBe(false);
  });

  it('rejects a message containing a www.-prefixed URL', () => {
    const result = reportShareSchema.safeParse({ toEmail: 'parent@example.com', message: 'See www.evil.example for details' });
    expect(result.success).toBe(false);
  });

  it('rejects a message containing control characters', () => {
    const result = reportShareSchema.safeParse({ toEmail: 'parent@example.com', message: 'Hi\r\nFake-Header: injected' });
    expect(result.success).toBe(false);
  });

  it('still enforces the max-length limit alongside the new checks', () => {
    const result = reportShareSchema.safeParse({ toEmail: 'parent@example.com', message: 'a'.repeat(501) });
    expect(result.success).toBe(false);
  });
});
