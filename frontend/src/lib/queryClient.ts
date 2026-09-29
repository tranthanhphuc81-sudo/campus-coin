/**
 * queryClient.ts
 * Singleton TanStack Query client: 30s `staleTime`, and retries exactly once but only for
 * network-level failures (never for real HTTP error responses, e.g. a validation 4xx).
 * Exports: queryClient, isNetworkError
 * Spec: docs/spec/07 §7 (API conventions)
 */
import { QueryClient } from '@tanstack/react-query';
import type { ApiError } from './apiClient/apiError';

/** True when `error` is an {@link ApiError} that never received an HTTP response (status `0`). */
export function isNetworkError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as ApiError).status === 0
  );
}

/** App-wide TanStack Query client (see module doc for retry/staleTime policy). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => failureCount < 1 && isNetworkError(error),
    },
  },
});
