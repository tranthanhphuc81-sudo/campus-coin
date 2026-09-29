/**
 * ai.keywords.ts
 * Tier-2 categorization: matches a transaction description against the keyword dictionary
 * (keywords.v1.json). Two indexes are built once at module load — an accented one (diacritics
 * kept) and an unaccented one (via the same normaliser used for merchant keys) — because some
 * Vietnamese words collide once diacritics are stripped (e.g. "đồ án" Academics vs "đồ ăn"/"do an"
 * Food): trying the accented index first resolves the common cases correctly, and only a
 * genuinely unaccented input (or one where the accented phrase itself is ambiguous) falls through
 * to the unaccented index, which can then legitimately be ambiguous (`null`).
 * Main exports: matchKeyword
 * Spec: docs/spec/05b §5.6 (AI categorization, tier 2)
 */
import { normalizeMerchantKey } from '../../lib/merchantKey.js';
import dictionary from './keywords.v1.json' with { type: 'json' };

/** Maps a normalised keyword phrase to the set of category names it appears under. */
type PhraseIndex = Map<string, Set<string>>;

/** Non-letter run (keeps diacritics); used to tokenise while keeping accents intact. */
const NON_LETTER_KEEP_ACCENTS = /[^\p{L}\s]+/gu;

/** Lower-cases, NFC-normalises and tokenises text while KEEPING diacritics (accented form). */
function normalizeAccentedPhrase(text: string): string {
  const lower = text.toLowerCase().normalize('NFC');
  const lettersOnly = lower.replace(NON_LETTER_KEEP_ACCENTS, ' ');
  return lettersOnly.split(/\s+/).filter(Boolean).join(' ');
}

/** Adds one (phrase -> categoryName) mapping to an index, merging into any existing entry. */
function addToIndex(index: PhraseIndex, phrase: string, categoryName: string): void {
  if (!phrase) return;
  const set = index.get(phrase) ?? new Set<string>();
  set.add(categoryName);
  index.set(phrase, set);
}

/** Builds the unaccented index from every (category -> keywords) entry. */
function buildUnaccentedIndex(): PhraseIndex {
  const index: PhraseIndex = new Map();
  for (const [categoryName, keywords] of Object.entries(dictionary.categories)) {
    for (const keyword of keywords) {
      const phrase = normalizeMerchantKey(keyword);
      if (phrase) addToIndex(index, phrase, categoryName);
    }
  }
  return index;
}

/**
 * Builds the accented index — deliberately SKIPPING any keyword whose accented-normalised form
 * equals its unaccented one (i.e. a keyword with no diacritics to begin with, e.g. the dictionary's
 * own plain-ASCII entries like "do an"). Without this filter, an already-unaccented keyword would
 * be found (and returned) by the accented lookup before the unaccented lookup ever runs its own
 * ambiguity check — which is exactly how "do an" (Academics vs Food) must resolve to `null`.
 */
function buildAccentedIndex(): PhraseIndex {
  const index: PhraseIndex = new Map();
  for (const [categoryName, keywords] of Object.entries(dictionary.categories)) {
    for (const keyword of keywords) {
      const accented = normalizeAccentedPhrase(keyword);
      if (!accented || accented === normalizeMerchantKey(keyword)) continue;
      addToIndex(index, accented, categoryName);
    }
  }
  return index;
}

const ACCENTED_INDEX = buildAccentedIndex();
const UNACCENTED_INDEX = buildUnaccentedIndex();

/** Longest keyword phrase (in tokens) across both indexes — bounds the sliding-window search. */
const MAX_PHRASE_TOKENS = Math.max(
  1,
  ...[...ACCENTED_INDEX.keys(), ...UNACCENTED_INDEX.keys()].map((phrase) => phrase.split(' ').length),
);

/**
 * Slides a window of decreasing length (longest first, so "grab food" beats "grab") across
 * `tokens`, left to right at each length, and returns the sole allowed category matched by the
 * first (i.e. longest, left-most) unambiguous window — or `null` when nothing unambiguous matches.
 *
 * Once a window is found in the index but genuinely AMBIGUOUS (2+ allowed categories — e.g. the
 * dictionary's own "do an" collision between Academics and Food), every token inside that window
 * is "poisoned": no shorter sub-window fully contained in it is tried afterwards. Without this, a
 * coincidental shorter match buried inside an already-proven-ambiguous phrase (e.g. "do an"'s own
 * "an" also happening to be Food's standalone word for "eat") would silently win — even though the
 * evidence for the longer phrase was already shown to be ambiguous. A window that simply has NO
 * entry in the index (nothing found) never poisons anything, so normal shrink-and-retry still finds
 * e.g. "grab" inside "Grab ride home".
 */
function tryIndex(tokens: string[], index: PhraseIndex, allowedNames: ReadonlySet<string>): string | null {
  const n = tokens.length;
  const poisoned = new Array<boolean>(n).fill(false);

  for (let len = Math.min(MAX_PHRASE_TOKENS, n); len >= 1; len--) {
    for (let start = 0; start + len <= n; start++) {
      if (poisoned.slice(start, start + len).some(Boolean)) continue;

      const phrase = tokens.slice(start, start + len).join(' ');
      const candidates = index.get(phrase);
      if (!candidates) continue;
      const allowedCandidates = [...candidates].filter((name) => allowedNames.has(name));
      if (allowedCandidates.length === 1) return allowedCandidates[0]!;
      if (allowedCandidates.length > 1) {
        // `k` only ever iterates this loop's own bounded token-index range, never client input.
        // eslint-disable-next-line security/detect-object-injection
        for (let k = start; k < start + len; k++) poisoned[k] = true;
      }
      // 0 allowed candidates: found in the dictionary but for a disallowed (wrong-type) category
      // only — not ambiguous from this caller's point of view, so does not poison anything.
    }
  }
  return null;
}

/**
 * Matches a free-text transaction description against the keyword dictionary, restricted to
 * `allowedNames` (the caller's active categories of the relevant type).
 * @param description - Raw transaction description.
 * @param allowedNames - Category names the match is allowed to resolve to.
 * @returns The matched category name, or `null` when nothing unambiguous matched.
 */
export function matchKeyword(description: string, allowedNames: ReadonlySet<string>): string | null {
  const accentedPhrase = normalizeAccentedPhrase(description);
  if (accentedPhrase) {
    const match = tryIndex(accentedPhrase.split(' '), ACCENTED_INDEX, allowedNames);
    if (match) return match;
  }

  const unaccentedPhrase = normalizeMerchantKey(description);
  if (!unaccentedPhrase) return null;
  return tryIndex(unaccentedPhrase.split(' '), UNACCENTED_INDEX, allowedNames);
}
