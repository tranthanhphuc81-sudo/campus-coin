/**
 * tokens.test.ts
 * Unit tests for backend/src/lib/tokens.ts: token length/format, uniqueness, sha256Hex against
 * a known vector, and recovery-code shape/normalisation.
 * Spec: docs/spec/09 §9.6 (tokens) · Rules: BR-AU-04
 */
import { describe, expect, it } from 'vitest';
import { generateRecoveryCode, generateToken, normalizeRecoveryCode, sha256Hex } from '../../../src/lib/tokens.js';

describe('generateToken', () => {
  it('produces a 43-character base64url string', () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('is unique across calls', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateToken()));
    expect(tokens.size).toBe(100);
  });
});

describe('sha256Hex', () => {
  it('matches a known SHA-256 vector', () => {
    // sha256("abc") — NIST test vector.
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('generateRecoveryCode', () => {
  it('is formatted xxxxxx-xxxxxx from the unambiguous alphabet', () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}-[A-HJ-NP-Z2-9]{6}$/);
  });

  it('is unique across calls', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateRecoveryCode()));
    expect(codes.size).toBe(100);
  });
});

describe('normalizeRecoveryCode', () => {
  it('upper-cases and strips separators/whitespace', () => {
    const code = generateRecoveryCode();
    const messy = ` ${code.toLowerCase().replace('-', ' ')} `;
    expect(normalizeRecoveryCode(messy)).toBe(code.replace('-', ''));
  });
});
