/**
 * ReportsByCategoryPage.tsx
 * "By category" report tab (`/app/reports/by-category`, docs/spec/05b §5.8 Bảng 22). Filters
 * (date range, type, categories) are URL-synced via `useCategoryBreakdownFilters`.
 * Exports: default (ReportsByCategoryPage)
 * Spec: docs/spec/05b §5.8
 */
import { useRef } from 'react';
import { CardSkeleton } from '../../../components/Skeletons';
import { ErrorState } from '../../../components/ErrorState';
import { CategoryBreakdownCard } from '../components/CategoryBreakdownCard';
import { CategoryBreakdownFiltersBar } from '../components/CategoryBreakdownFiltersBar';
import { ExportPngButton } from '../components/ExportPngButton';
import { useCategoryBreakdownQuery } from '../hooks';
import { useCategoryBreakdownFilters } from '../useCategoryBreakdownFilters';

/** "By category" report tab: doughnut + table, with date-range/type/category filters. */
export default function ReportsByCategoryPage() {
  const { filters, setFilters } = useCategoryBreakdownFilters();
  const query = useCategoryBreakdownQuery(filters);
  const captureRef = useRef<HTMLDivElement>(null);

  return (
    <div>
      <CategoryBreakdownFiltersBar filters={filters} onChange={setFilters} />

      <div className="d-flex justify-content-end mb-2">
        <ExportPngButton targetRef={captureRef} filename={`campuscoin-report-by-category-${filters.from}-${filters.to}.png`} />
      </div>

      <div ref={captureRef}>
        {query.isLoading ? (
          <CardSkeleton />
        ) : query.isError || !query.data ? (
          <ErrorState onRetry={() => void query.refetch()} />
        ) : (
          <CategoryBreakdownCard report={query.data} />
        )}
      </div>
    </div>
  );
}
