/**
 * ErrorState.tsx
 * Error message + "Retry" button shown when a query/section fails to load (spec §8.6).
 * Exports: ErrorState
 * Spec: docs/spec/08 §8.6 (loading/empty/error states)
 */
import { en } from '../i18n/en';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

/** Generic error placeholder with an optional retry action. */
export function ErrorState({ message = en.errors.generic, onRetry }: ErrorStateProps) {
  return (
    <div className="text-center py-5" role="alert">
      <i className="bi bi-exclamation-triangle display-4 text-bc-expense" aria-hidden="true" />
      <p className="mt-3 mb-0">{message}</p>
      {onRetry ? (
        <button type="button" className="btn btn-outline-primary mt-3" onClick={onRetry}>
          {en.common.retry}
        </button>
      ) : null}
    </div>
  );
}
