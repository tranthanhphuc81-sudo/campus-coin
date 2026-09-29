/**
 * Skeletons.tsx
 * Bootstrap `placeholder-glow` loading blocks sized to roughly match real content, so content
 * arriving does not shift the layout (spec §8.6). Purely decorative: `aria-hidden`.
 * Exports: CardSkeleton, ChartSkeleton, TableSkeleton
 * Spec: docs/spec/08 §8.6 (loading/empty/error states)
 */

/** Loading placeholder shaped like a small stat/summary card. */
export function CardSkeleton() {
  return (
    <div className="card" aria-hidden="true">
      <div className="card-body placeholder-glow">
        <span className="placeholder col-6 mb-2 d-block" />
        <span className="placeholder col-8 mb-2 d-block" />
        <span className="placeholder col-4 d-block" />
      </div>
    </div>
  );
}

/** Loading placeholder shaped like a chart panel. */
export function ChartSkeleton() {
  return (
    <div className="placeholder-glow" aria-hidden="true">
      <span className="placeholder w-100 d-block rounded" style={{ height: '16rem' }} />
    </div>
  );
}

interface TableSkeletonProps {
  /** Number of placeholder rows to render (default 5). */
  rows?: number;
}

/** Loading placeholder shaped like a data table's rows. */
export function TableSkeleton({ rows = 5 }: TableSkeletonProps) {
  return (
    <div className="placeholder-glow" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className="placeholder col-12 mb-2 d-block" style={{ height: '1.5rem' }} />
      ))}
    </div>
  );
}
