/**
 * AdminStatsPage.tsx
 * Admin "Statistics" page (`/admin/stats`): the full categories-usage deep-dive — a lazy-loaded
 * Chart.js bar chart plus a complete data table underneath (spec §8.5: chart + table, not a toggle,
 * since this page's whole purpose is a detailed look at the numbers).
 * Exports: default (AdminStatsPage)
 * Spec: docs/spec/05c §5.13 (Table 24) · docs/spec/08 §8.5 (accessibility: chart + table)
 */
import { TransactionType } from '@campuscoin/shared';
import { lazy, Suspense } from 'react';
import { ChartSkeleton, TableSkeleton } from '../../../components/Skeletons';
import { EmptyState } from '../../../components/EmptyState';
import { ErrorState } from '../../../components/ErrorState';
import { PageHeader } from '../../../components/PageHeader';
import { en } from '../../../i18n/en';
import { useAdminCategoriesUsageQuery } from '../hooks';

const CategoryUsageBarChart = lazy(() => import('../components/charts/CategoryUsageBarChart'));

/** Admin "Statistics" page: categories-usage bar chart + full data table (both always visible). */
export default function AdminStatsPage() {
  const t = en.adminStats.categoriesUsage;
  const usageQuery = useAdminCategoriesUsageQuery();
  const items = usageQuery.data ?? [];

  return (
    <>
      <PageHeader title={en.nav.adminStats} subtitle={t.subtitle} />

      {usageQuery.isLoading ? (
        <>
          <ChartSkeleton />
          <div className="mt-4">
            <TableSkeleton rows={8} />
          </div>
        </>
      ) : usageQuery.isError ? (
        <ErrorState onRetry={() => void usageQuery.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon="bi-bar-chart" message={t.empty} />
      ) : (
        <>
          <div className="card mb-4">
            <div className="card-body">
              <h2 className="h6 mb-3">{t.chartTitle}</h2>
              <div style={{ height: `${Math.max(16, items.length * 2)}rem` }}>
                <Suspense fallback={<ChartSkeleton />}>
                  <CategoryUsageBarChart items={items} />
                </Suspense>
              </div>
            </div>
          </div>

          <div className="table-responsive">
            <table className="table table-sm">
              <caption className="visually-hidden">{t.tableCaption}</caption>
              <thead>
                <tr>
                  <th scope="col">{t.colCategory}</th>
                  <th scope="col">{t.colType}</th>
                  <th scope="col" className="text-end">
                    {t.colTransactions}
                  </th>
                  <th scope="col" className="text-end">
                    {t.colUsers}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.categoryId}>
                    <td>{item.categoryName}</td>
                    <td>{item.type === TransactionType.INCOME ? t.typeIncome : t.typeExpense}</td>
                    <td className="text-end">{item.transactionCount.toLocaleString('en-US')}</td>
                    <td className="text-end">{item.userCount.toLocaleString('en-US')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
