/**
 * sanitize.test.ts
 * Unit tests for `sanitize()` (backend/src/integrations/ai/sanitize.ts): strips URLs, emails,
 * phone-like runs and long digit runs before any text reaches an external LLM provider, and never
 * backtracks catastrophically on adversarial input (docs/spec/09 §9.9).
 * Spec: docs/spec/09 §9.9 (LLM data minimisation)
 */
import { describe, expect, it } from 'vitest';
import { sanitize } from '../../../src/integrations/ai/sanitize.js';

describe('sanitize', () => {
  it('replaces a URL with [url]', () => {
    expect(sanitize('Paid via https://pay.example.com/invoice/123')).toBe('Paid via [url]');
  });

  it('replaces a www.-prefixed URL with [url]', () => {
    expect(sanitize('see www.example.com for details')).toBe('see [url] for details');
  });

  it('replaces an email address with [email]', () => {
    expect(sanitize('Refund to jane.doe+test@example.com please')).toBe('Refund to [email] please');
  });

  it('replaces a phone number with separators with [phone]', () => {
    expect(sanitize('Call me at +84 912-345-678 anytime')).toBe('Call me at [phone] anytime');
  });

  it('replaces a bare 6+ digit run (too short to look phone-like) with [phone]', () => {
    // M1 review fix: the phone-like and long-digit-run patterns are now one merged, digit-count-
    // bounded pattern (see sanitize.ts), so a bare digit run also gets the "[phone]" marker.
    expect(sanitize('Order #123456 confirmed')).toBe('Order #[phone] confirmed');
  });

  it('keeps a short (< 6 digit) run untouched', () => {
    expect(sanitize('Room 302 rent')).toBe('Room 302 rent');
  });

  it('collapses internal whitespace and trims', () => {
    expect(sanitize('  Campus   Cafe   lunch  ')).toBe('Campus Cafe lunch');
  });

  it('truncates to AI_LLM_TEXT_MAX_CHARS', () => {
    const long = 'a'.repeat(500);
    const result = sanitize(long);
    expect(result.length).toBe(100);
  });

  it('never backtracks catastrophically on a long adversarial input (ReDoS check)', () => {
    const adversarial = `${'1'.repeat(10_000)} ${'a'.repeat(10_000)}@${'b'.repeat(10_000)}.com`;
    const start = Date.now();
    sanitize(adversarial);
    expect(Date.now() - start).toBeLessThan(500);
  });

  it('handles an already-clean description unchanged (aside from trimming)', () => {
    expect(sanitize('Campus Cafe lunch')).toBe('Campus Cafe lunch');
  });

  // --- M1 review fix: PII-shaped bypasses that previously slipped through unredacted. ---

  it('redacts a card/account number separated by slashes', () => {
    expect(sanitize('Card 4111/1111/1111/1111 charged')).toBe('Card [phone] charged');
  });

  it('redacts a card/account number separated by underscores', () => {
    expect(sanitize('Card 4111_1111_1111_1111 charged')).toBe('Card [phone] charged');
  });

  it('redacts comma-separated digit groups', () => {
    expect(sanitize('Account 12345,67890,12345 closed')).toBe('Account [phone] closed');
  });

  it('redacts full-width digits (NFKC-normalised before matching)', () => {
    expect(sanitize('Phone ０９１２３４５６７８ please call')).toBe('Phone [phone] please call');
  });

  it('redacts a double-spaced digit run fully, leaving no digit tail', () => {
    expect(sanitize('Card 4111  1111  1111  1111 charged')).toBe('Card [phone] charged');
  });

  it('redacts an email address with no TLD (e.g. a local/intranet address)', () => {
    expect(sanitize('Contact john@localhost for access')).toBe('Contact [email] for access');
  });

  it('redacts a bare domain with no scheme/www prefix', () => {
    const result = sanitize('Buy it at shop.example.com/x today');
    expect(result).not.toContain('example.com');
    expect(result).toContain('[url]');
  });

  it('does NOT over-redact a plain 5-digit number', () => {
    expect(sanitize('Room 12345 rent')).toBe('Room 12345 rent');
  });

  it('does NOT over-redact a plain word', () => {
    expect(sanitize('Groceries at Campus Mart')).toBe('Groceries at Campus Mart');
  });
});
