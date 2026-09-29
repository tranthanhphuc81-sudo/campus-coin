/**
 * merchantKey.ts
 * Normalises a transaction description into a merchant key used to detect likely duplicate
 * transactions (BR-TX §5.4: same merchant, same day, similar amount → flagged as a possible
 * duplicate). Normalisation strips accents/punctuation/digits and common stop-words so
 * "Campus Café #12" and "Campus Cafe" collapse to the same key.
 * Main exports: normalizeMerchantKey
 * Spec: docs/spec/05a §5.4 (transactions)
 */
import { MERCHANT_KEY_MAX_LENGTH } from '@campuscoin/shared';

/** Words too generic to help identify a merchant; dropped after tokenising (already lower-case). */
const STOP_WORDS: ReadonlySet<string> = new Set(['tai', 'at', 'the', 'o']);

/** Anything that isn't a lower-case ASCII letter or whitespace, once diacritics are stripped. */
const NON_LETTER = /[^a-z\s]+/g;

/**
 * Normalises a free-text transaction description into a stable merchant key, or `null` when
 * nothing meaningful is left (e.g. the description is empty, or only digits/punctuation).
 *
 * Example: `normalizeMerchantKey('Campus Café #12')` → `'campus cafe'`.
 *
 * @param description - Raw transaction description, possibly `null`/`undefined`.
 * @returns Lower-case, accent-free, stop-word-free key (max {@link MERCHANT_KEY_MAX_LENGTH}
 *   characters), or `null` when there is nothing left to key on.
 */
export function normalizeMerchantKey(description: string | null | undefined): string | null {
  const trimmed = description?.trim();
  if (!trimmed) return null;

  // "đ"/"Đ" do not decompose under NFD, so fold them to "d"/"D" before stripping diacritics.
  const withoutDStroke = trimmed.replace(/đ/g, 'd').replace(/Đ/g, 'D');
  const withoutDiacritics = withoutDStroke.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const lower = withoutDiacritics.toLowerCase();
  const lettersOnly = lower.replace(NON_LETTER, ' ');

  const tokens = lettersOnly.split(/\s+/).filter((t) => t.length > 0 && !STOP_WORDS.has(t));
  const joined = tokens.join(' ').trim().slice(0, MERCHANT_KEY_MAX_LENGTH).trim();

  return joined.length > 0 ? joined : null;
}
