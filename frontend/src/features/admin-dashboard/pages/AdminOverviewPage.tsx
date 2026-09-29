/**
 * AdminOverviewPage.tsx
 * Admin portal home page (`/admin`): a row of stat cards from `GET /admin/stats/overview` plus a
 * ranked "Top categories" list (top 5 by transaction count) from `GET /admin/stats/categories-usage`.
 * Exports: default (AdminOverviewPage)
 * Spec: docs/spec/08 §8.3 (admin dashboard) · docs/spec/05c §5.13 (Table 24)
 */
import { CardSkeleton, TableSkeleton } from '../../../components/Skeletons';
import { ErrorState } from '../../../components/ErrorState';
import { EmptyState } from '../../../components/EmptyState';
import { PageHeader } from '../../../components/PageHeader';
import { en } from '../../../i18n/en';
import { useAdminCategoriesUsageQuery, useAdminStatsOverviewQuery } from '../hooks';

const TOP_CATEGORIES_LIMIT = 5;

/** One stat-card tile: a label and a big number (or "n/a" for a null metric). */
function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="col">
      <div className="card h-100">
        <div className="card-body">
          <p className="small text-body-secondary mb-1">{label}</p>
          <p className="h3 mb-0">{value}</p>
        </div>
      </div>
    </div>
  );
}

/** Admin portal home page: overview stat cards + top-5 categories ranked list. */
export default function AdminOverviewPage() {
  const t = en.adminStats.overview;
  const overviewQuery = useAdminStatsOverviewQuery();
  const usageQuery = useAdminCategoriesUsageQuery();

  return (
    <>
      <PageHeader title={en.nav.dashboard} />

      {overviewQuery.isLoading ? (
        <div className="row row-cols-1 row-cols-sm-2 row-cols-lg-4 g-3 mb-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div className="col" key={i}>
              <CardSkeleton />
            </div>
          ))}
        </div>
      ) : overviewQuery.isError || !overviewQuery.data ? (
        <ErrorState message={t.loadError} onRetry={() => void overviewQuery.refetch()} />
      ) : (
        <div className="row row-cols-1 row-cols-sm-2 row-cols-lg-4 g-3 mb-4">
          <StatCard label={t.dau} value={overviewQuery.data.dau.toLocaleString('en-US')} />
          <StatCard label={t.mau} value={overviewQuery.data.mau.toLocaleString('en-US')} />
          <StatCard
            label={t.usersByStatus}
            value={`${overviewQuery.data.usersByStatus.active} ${t.statusActive.toLowerCase()} / ${overviewQuery.data.usersByStatus.pending} ${t.statusPending.toLowerCase()} / ${overviewQuery.data.usersByStatus.disabled} ${t.statusDisabled.toLowerCase()}`}
          />
          <StatCard label={t.totalTransactions} value={overviewQuery.data.totalTransactions.toLocaleString('en-US')} />
          <StatCard label={t.newUsers30d} value={overviewQuery.data.newUsers30d.toLocaleString('en-US')} />
          <StatCard
            label={t.growth30d}
            value={overviewQuery.data.growthPct30d === null ? t.notAvailable : `${overviewQuery.data.growthPct30d >= 0 ? '+' : ''}${overviewQuery.data.growthPct30d}%`}
          />
          <StatCard
            label={t.aiAcceptanceRate}
            value={overviewQuery.data.aiAcceptanceRate === null ? t.notAvailable : `${Math.round(overviewQuery.data.aiAcceptanceRate * 100)}%`}
          />
          <StatCard label={t.insightsGenerated} value={overviewQuery.data.insightsGenerated.toLocaleString('en-US')} />
        </div>
      )}

      <h2 className="h5">{t.topCategoriesTitle}</h2>
      {usageQuery.isLoading ? (
        <TableSkeleton rows={5} />
      ) : usageQuery.isError ? (
        <ErrorState message={t.loadError} onRetry={() => void usageQuery.refetch()} />
      ) : (usageQuery.data ?? []).length === 0 ? (
        <EmptyState icon="bi-bar-chart" message={t.topCategoriesEmpty} />
      ) : (
        <ol className="list-group list-group-numbered">
          {(usageQuery.data ?? []).slice(0, TOP_CATEGORIES_LIMIT).map((item) => (
            <li key={item.categoryId} className="list-group-item d-flex justify-content-between align-items-center">
              {item.categoryName}
              <span className="badge text-bg-secondary rounded-pill">{item.transactionCount.toLocaleString('en-US')}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
