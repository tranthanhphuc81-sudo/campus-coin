/**
 * sanitize.ts
 * Strips PII-shaped substrings out of a transaction description before it is ever sent to an
 * external LLM provider (docs/spec/09 §9.9: the LLM receives only sanitised, minimal data).
 * Security-critical: every regex below uses only bounded quantifiers (no nested/ambiguous
 * quantifiers), so none can backtrack catastrophically (ReDoS) even on a long adversarial input.
 * Main exports: sanitize
 * Spec: docs/spec/09 §9.9 (LLM data minimisation)
 */
import { AI_LLM_TEXT_MAX_CHARS } from '@campuscoin/shared';

// Order matters: URLs and emails are replaced before the bare-domain/digit-run patterns, so an
// email/URL's own digits or domain never get double-replaced by a later, broader pattern.
// Linear (single unbounded class, no nested quantifiers) — safe against ReDoS.
const URL_PATTERN = /https?:\/\/\S+|www\.\S+/gi;
// `{0,4}` (was `{1,4}`) so a TLD-less address like "john@localhost" is still caught (M1 review fix).
// eslint-disable-next-line security/detect-unsafe-regex -- bounded groups (`{2,24}`), no nesting/backtracking ambiguity.
const EMAIL_PATTERN = /[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,24}){0,4}/g;
// A bare domain with no `http(s)://`/`www.` prefix (e.g. "shop.example.com/x") — M1 review fix.
// Short, non-exhaustive TLD allow-list on purpose (not a full public-suffix list, per the review's
// own guidance): catches the common cases without an unbounded/ambiguous character class.
const BARE_DOMAIN_PATTERN = /\b[\w-]{1,63}\.(?:com|net|org|vn|io|me|edu|gov)\S*/gi;
// One bounded digit run (M1 review fix): optional leading '+', a digit, then 5-30 more digits each
// optionally preceded by up to 2 separator chars (space/dash/dot/slash/underscore/comma/parens).
// Replaces the old separate phone-like + long-digit-run patterns, which bounded the run by TOTAL
// CHARACTER length — a double-spaced group like "4111  1111  1111  1111" could exhaust that budget
// before consuming every digit, leaking a "11" tail. Bounding by DIGIT count instead (both inner
// `{0,2}` and outer `{5,30}` quantifiers stay finite) closes that gap and also catches comma/slash/
// underscore-separated account numbers, while remaining linear time (no nested/ambiguous quantifiers).
// eslint-disable-next-line security/detect-unsafe-regex -- both quantifiers are finite (inner {0,2}, outer {5,30}); the ReDoS test below covers a 10k-char adversarial input in well under 500ms.
const DIGIT_RUN_PATTERN = /\+?\d(?:[\s\-./_,()]{0,2}\d){5,30}/g;

/**
 * Sanitises free-text before it leaves the process to an external AI provider: normalises
 * full-width/compatibility characters, then replaces URLs, emails, bare domains and phone-like/long
 * digit runs with fixed placeholders, collapses whitespace, and truncates to
 * {@link AI_LLM_TEXT_MAX_CHARS}.
 * @param text - Raw, user-authored text (a transaction description or category name).
 * @returns Sanitised text, safe to include in a provider prompt.
 */
export function sanitize(text: string): string {
  // M1 review fix: NFKC folds full-width digits/letters (e.g. "０-９") to their ordinary ASCII
  // form, so they can't silently skip every \d-based pattern below.
  const normalized = text.normalize('NFKC');
  const withoutUrls = normalized.replace(URL_PATTERN, '[url]');
  const withoutEmails = withoutUrls.replace(EMAIL_PATTERN, '[email]');
  const withoutDomains = withoutEmails.replace(BARE_DOMAIN_PATTERN, '[url]');
  const withoutDigitRuns = withoutDomains.replace(DIGIT_RUN_PATTERN, '[phone]');
  const collapsed = withoutDigitRuns.replace(/\s+/g, ' ').trim();
  return collapsed.slice(0, AI_LLM_TEXT_MAX_CHARS);
}
