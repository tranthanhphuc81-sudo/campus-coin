/**
 * apiError.ts
 * Normalized shape every `apiClient` rejection resolves to (never a raw AxiosError), built from
 * the backend's RFC 9457 `problem+json` body. `applyFieldErrors` wires 422 validation errors
 * into a React Hook Form instance.
 * Exports: ProblemDetails, ApiError, applyFieldErrors
 * Spec: docs/spec/07 §7.2 (error format)
 */
import type { FieldPath, FieldValues, UseFormSetError } from 'react-hook-form';

/** RFC 9457 `problem+json` body shape returned by the API on every error response. */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  requestId?: string;
  errors?: { field: string; message: string }[];
}

/**
 * Normalized API error produced by `apiClient`'s response interceptor.
 * `status` is `0` when the request never received an HTTP response (offline/timeout/CORS) —
 * see `queryClient.ts`'s `isNetworkError`, which treats that case as retryable.
 */
export interface ApiError {
  status: number;
  type: string;
  title: string;
  detail?: string;
  fieldErrors: Record<string, string>;
  requestId?: string;
}

/**
 * Applies every `field -> message` entry of an {@link ApiError} to a React Hook Form instance
 * via `setError`, so 422 validation responses surface next to the relevant input.
 * @param setError - `formState`'s `setError` from `useForm()`.
 * @param error - a normalized {@link ApiError} (typically from a failed mutation).
 */
export function applyFieldErrors<TFieldValues extends FieldValues>(
  setError: UseFormSetError<TFieldValues>,
  error: ApiError,
): void {
  for (const [field, message] of Object.entries(error.fieldErrors)) {
    setError(field as FieldPath<TFieldValues>, { type: 'server', message });
  }
}
