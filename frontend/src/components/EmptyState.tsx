/**
 * EmptyState.tsx
 * Icon + message (+ optional action) shown when a list/section has no data (spec §8.6).
 * Exports: EmptyState
 * Spec: docs/spec/08 §8.6 (loading/empty/error states)
 */
interface EmptyStateProps {
  /** Bootstrap Icons class, e.g. `'bi-inbox'`. */
  icon?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Generic "nothing here yet" placeholder with an optional call-to-action button. */
export function EmptyState({ icon = 'bi-inbox', message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="text-center text-body-secondary py-5">
      <i className={`bi ${icon} display-4`} aria-hidden="true" />
      <p className="mt-3 mb-0">{message}</p>
      {actionLabel && onAction ? (
        <button type="button" className="btn btn-primary mt-3" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
