import { normalizeMerchantKey, tokenizeNormalized } from "./normalize.js";

export type KeywordCategoryOption = {
  id: number;
  name: string;
};

type KeywordEntry = {
  keyword: string;
  categoryRef: string;
  priority: number;
};

const KEYWORD_DICTIONARY: KeywordEntry[] = [
  { keyword: "cafe", categoryRef: "food", priority: 10 },
  { keyword: "coffee", categoryRef: "food", priority: 10 },
  { keyword: "canteen", categoryRef: "food", priority: 12 },
  { keyword: "grab food", categoryRef: "food", priority: 8 },
  { keyword: "grab bike", categoryRef: "transport", priority: 5 },
  { keyword: "bus", categoryRef: "transport", priority: 11 },
  { keyword: "metro", categoryRef: "transport", priority: 11 },
  { keyword: "netflix", categoryRef: "subscriptions", priority: 9 },
  { keyword: "spotify", categoryRef: "subscriptions", priority: 9 },
  { keyword: "textbook", categoryRef: "academics", priority: 7 },
  { keyword: "tuition", categoryRef: "academics", priority: 7 },
  { keyword: "rent", categoryRef: "hostel/rent", priority: 6 },
  { keyword: "dorm", categoryRef: "hostel/rent", priority: 6 },
];

export type KeywordSuggestion = {
  categoryId: number;
  categoryName: string;
  confidence: number;
};

type CategoryScore = {
  categoryId: number;
  categoryName: string;
  matchedTokenCount: number;
  longestKeywordTokenLength: number;
  bestPriority: number;
};

function containsSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || haystack.length < needle.length) {
    return false;
  }

  for (let offset = 0; offset <= haystack.length - needle.length; offset += 1) {
    let matches = true;
    for (let index = 0; index < needle.length; index += 1) {
      if (haystack[offset + index] !== needle[index]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return true;
    }
  }

  return false;
}

function buildCategoryLookup(options: KeywordCategoryOption[]) {
  const lookup = new Map<string, KeywordCategoryOption>();

  for (const option of options) {
    const normalized = normalizeMerchantKey(option.name) ?? option.name.toLowerCase().trim();
    lookup.set(normalized, option);
  }

  return lookup;
}

export function suggestFromKeywords(
  normalizedMerchantKey: string,
  categories: KeywordCategoryOption[],
): KeywordSuggestion | null {
  const merchantTokens = tokenizeNormalized(normalizedMerchantKey);
  if (merchantTokens.length === 0) {
    return null;
  }

  const categoryLookup = buildCategoryLookup(categories);
  const scoreByCategoryId = new Map<number, CategoryScore>();

  for (const entry of KEYWORD_DICTIONARY) {
    const option = categoryLookup.get(entry.categoryRef);
    if (!option) {
      continue;
    }

    const keywordTokens = tokenizeNormalized(entry.keyword);
    if (!containsSequence(merchantTokens, keywordTokens)) {
      continue;
    }

    const existing = scoreByCategoryId.get(option.id);
    if (!existing) {
      scoreByCategoryId.set(option.id, {
        categoryId: option.id,
        categoryName: option.name,
        matchedTokenCount: keywordTokens.length,
        longestKeywordTokenLength: keywordTokens.length,
        bestPriority: entry.priority,
      });
      continue;
    }

    existing.matchedTokenCount += keywordTokens.length;
    existing.longestKeywordTokenLength = Math.max(
      existing.longestKeywordTokenLength,
      keywordTokens.length,
    );
    existing.bestPriority = Math.min(existing.bestPriority, entry.priority);
  }

  const candidates = [...scoreByCategoryId.values()];
  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => {
    if (right.matchedTokenCount !== left.matchedTokenCount) {
      return right.matchedTokenCount - left.matchedTokenCount;
    }

    if (right.longestKeywordTokenLength !== left.longestKeywordTokenLength) {
      return right.longestKeywordTokenLength - left.longestKeywordTokenLength;
    }

    return left.bestPriority - right.bestPriority;
  });

  if (candidates.length > 1) {
    const [winner, runnerUp] = candidates;
    if (
      winner &&
      runnerUp &&
      winner.matchedTokenCount === runnerUp.matchedTokenCount &&
      winner.longestKeywordTokenLength === runnerUp.longestKeywordTokenLength &&
      winner.bestPriority === runnerUp.bestPriority
    ) {
      return null;
    }
  }

  const winner = candidates[0];
  if (!winner) {
    return null;
  }

  return {
    categoryId: winner.categoryId,
    categoryName: winner.categoryName,
    confidence: 0.75,
  };
}
