/**
 * useCategorySuggestion.ts
 * Debounced AI category-suggestion hook used by the quick-add/edit form's "AI suggestion" chip.
 * Debounces the description, only queries once at least `AI_SUGGEST_MIN_CHARS` characters are
 * typed, and never surfaces a stale suggestion for text the user has since changed further
 * (TC-17: AI failures/latency are silent and never block Save).
 * Exports: useCategorySuggestion
 * Spec: docs/spec/05a §5.4.1 (AI category suggestion) · docs/spec/05b (3-tier categorizer)
 */
import { AI_SUGGEST_DEBOUNCE_MS, AI_SUGGEST_MIN_CHARS, type CategorySuggestionDto, type TransactionType } from '@campuscoin/shared';
import { useQuery } from '@tanstack/react-query';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { suggestCategory } from '../ai/api';

/** How long a suggestion response is considered fresh before a repeat query would refetch it. */
const SUGGESTION_STALE_TIME_MS = 5 * 60 * 1000;

interface UseCategorySuggestionInput {
  description: string;
  type: TransactionType;
  /** Set `false` to never query (e.g. edit mode before the description has been touched). */
  enabled?: boolean;
}

interface UseCategorySuggestionResult {
  suggestion: CategorySuggestionDto | null;
  /** True while a suggestion is pending (debounce window still running, or the request in flight). */
  isSuggesting: boolean;
}

/**
 * Debounces `description`, then asks `POST /ai/categorize/suggest` for a category suggestion.
 * TanStack Query aborts any in-flight request (via the `signal` passed to `queryFn`) as soon as
 * the debounced value changes again, so a superseded request never resolves after a fresher one.
 * @param input description/type to suggest for, plus an `enabled` gate.
 * @returns the current suggestion (or `null` if none/not eligible/errored) and a suggesting flag.
 */
export function useCategorySuggestion({ description, type, enabled = true }: UseCategorySuggestionInput): UseCategorySuggestionResult {
  const trimmed = description.trim();
  const debounced = useDebouncedValue(trimmed, AI_SUGGEST_DEBOUNCE_MS);
  const eligible = enabled && debounced.length >= AI_SUGGEST_MIN_CHARS;

  const query = useQuery({
    queryKey: ['ai', 'suggest', type, debounced],
    queryFn: ({ signal }) => suggestCategory({ description: debounced, type }, signal),
    enabled: eligible,
    retry: false,
    staleTime: SUGGESTION_STALE_TIME_MS,
    gcTime: SUGGESTION_STALE_TIME_MS,
  });

  // Guard against showing a suggestion for text the user has since kept typing past (debounced
  // value momentarily lags trimmed while the timer is still running).
  const suggestion = query.isSuccess && debounced === trimmed ? (query.data ?? null) : null;
  const isSuggesting = enabled && trimmed.length >= AI_SUGGEST_MIN_CHARS && (debounced !== trimmed || query.isFetching);

  return { suggestion, isSuggesting };
}
