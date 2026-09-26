const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "by",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "or",
  "the",
  "to",
  "via",
  "with",
  "no",
  "num",
  "order",
  "payment",
  "pay",
  "purchase",
  "store",
  "shop",
  "ltd",
  "inc",
  "co",
]);

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(?:\+84|0)(?:[\s.-]?\d){9,10}\b/g;
const LONG_NUMBER_REGEX = /\b\d[\d\s-]{8,}\d\b/g;

export function scrubPii(value: string): string {
  return value
    .replace(EMAIL_REGEX, "[EMAIL]")
    .replace(PHONE_REGEX, "[PHONE]")
    .replace(LONG_NUMBER_REGEX, "[NUMBER]");
}

export function normalizeMerchantKey(value: string): string | null {
  const lowered = value.toLowerCase();
  const noDiacritics = lowered
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");

  const withoutDigits = noDiacritics.replace(/[0-9]/g, "");
  const alphaSpacesOnly = withoutDigits.replace(/[^a-z\s]/g, " ");
  const tokens = alphaSpacesOnly
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !STOP_WORDS.has(token));

  const normalized = tokens.join(" ").trim().slice(0, 100);
  return normalized.length > 0 ? normalized : null;
}

export function tokenizeNormalized(value: string): string[] {
  return value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}
