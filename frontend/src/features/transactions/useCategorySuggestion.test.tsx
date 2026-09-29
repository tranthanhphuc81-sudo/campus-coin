/**
 * useCategorySuggestion.test.tsx
 * Verifies: the debounce window gates every request (no call before it elapses, exactly one
 * call after), text under `AI_SUGGEST_MIN_CHARS` never queries, a superseded request's
 * `AbortSignal` fires once the debounced text changes again, a rejected request yields
 * `suggestion: null` without throwing, and `isSuggesting` tracks the debounce + fetch window.
 * Each timing test mounts the hook with an empty (non-eligible) description first, then rerenders
 * with the target text — matching real typing, where the debounce timer only starts once text
 * actually changes (a direct initial mount with non-empty text has no artificial first delay).
 * Spec: docs/spec/05b (3-tier categorizer) · TC-17 (AI errors are silent, never block Save)
 */
import { AI_SUGGEST_DEBOUNCE_MS, TransactionType, type CategorySuggestionDto } from '@campuscoin/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCategorySuggestion } from './useCategorySuggestion';

vi.mock('../ai/api', () => ({ suggestCategory: vi.fn() }));
import { suggestCategory } from '../ai/api';

const mockSuggest = vi.mocked(suggestCategory);

const SAMPLE_SUGGESTION: CategorySuggestionDto = { categoryId: 1, categoryName: 'Food', confidence: '0.850', tier: 3 };

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function renderSuggestion(queryClient: QueryClient) {
  return renderHook(({ description }) => useCategorySuggestion({ description, type: TransactionType.EXPENSE }), {
    initialProps: { description: '' },
    wrapper: makeWrapper(queryClient),
  });
}

/**
 * Flushes a query's already-settled fetch promise into a React re-render. Must run in its own
 * `act()` call, separate from the one that advanced the debounce timer: the query's `fetch()` is
 * kicked off by an effect that only runs once that render commits, so awaiting further inside the
 * *same* `act()` call resolves the promise before the effect (and hence the fetch) has even
 * started — nothing is left to flush yet.
 */
async function flushQuery() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  mockSuggest.mockReset();
});

describe('useCategorySuggestion', () => {
  it('does not call suggestCategory before the debounce window elapses', async () => {
    mockSuggest.mockResolvedValue(SAMPLE_SUGGESTION);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = renderSuggestion(queryClient);

    rerender({ description: 'coffee' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AI_SUGGEST_DEBOUNCE_MS - 1);
    });
    expect(mockSuggest).not.toHaveBeenCalled();
  });

  it('calls suggestCategory exactly once after the debounce window elapses', async () => {
    mockSuggest.mockResolvedValue(SAMPLE_SUGGESTION);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, rerender } = renderSuggestion(queryClient);

    rerender({ description: 'coffee' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AI_SUGGEST_DEBOUNCE_MS);
    });
    await flushQuery();
    expect(mockSuggest).toHaveBeenCalledTimes(1);
    expect(mockSuggest).toHaveBeenCalledWith({ description: 'coffee', type: TransactionType.EXPENSE }, expect.any(AbortSignal));
    expect(result.current.suggestion).toEqual(SAMPLE_SUGGESTION);
  });

  it('never calls suggestCategory for text under AI_SUGGEST_MIN_CHARS', async () => {
    mockSuggest.mockResolvedValue(SAMPLE_SUGGESTION);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = renderSuggestion(queryClient);

    rerender({ description: 'a' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AI_SUGGEST_DEBOUNCE_MS * 2);
    });
    expect(mockSuggest).not.toHaveBeenCalled();
  });

  it('aborts a superseded request once the debounced text changes again', async () => {
    const signals: AbortSignal[] = [];
    mockSuggest.mockImplementation((_input, signal) => {
      if (signal) signals.push(signal);
      return new Promise(() => {
        /* never resolves — we only care about the abort signal */
      });
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = renderSuggestion(queryClient);

    rerender({ description: 'coffee' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AI_SUGGEST_DEBOUNCE_MS);
    });
    expect(signals).toHaveLength(1);
    const firstSignal = signals[0]!;
    expect(firstSignal.aborted).toBe(false);

    rerender({ description: 'coffee shop' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AI_SUGGEST_DEBOUNCE_MS);
    });

    expect(firstSignal.aborted).toBe(true);
  });

  it('yields suggestion: null (never throws) when the request rejects', async () => {
    mockSuggest.mockRejectedValue(new Error('network error'));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, rerender } = renderSuggestion(queryClient);

    rerender({ description: 'coffee' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AI_SUGGEST_DEBOUNCE_MS);
    });
    await flushQuery();

    expect(result.current.suggestion).toBeNull();
    expect(result.current.isSuggesting).toBe(false);
  });

  it('transitions isSuggesting true -> false across the debounce window and fetch', async () => {
    let resolveFetch!: (value: CategorySuggestionDto | null) => void;
    mockSuggest.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, rerender } = renderSuggestion(queryClient);

    rerender({ description: 'coffee' });
    // Still inside the debounce window: eligible text, but no request fired yet.
    expect(result.current.isSuggesting).toBe(true);
    expect(mockSuggest).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AI_SUGGEST_DEBOUNCE_MS);
    });
    // Debounce elapsed, request now in flight.
    expect(mockSuggest).toHaveBeenCalledTimes(1);
    expect(result.current.isSuggesting).toBe(true);

    await act(async () => {
      resolveFetch(SAMPLE_SUGGESTION);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.isSuggesting).toBe(false);
    expect(result.current.suggestion).toEqual(SAMPLE_SUGGESTION);
  });
});
