/**
 * TopCategoryCard.tsx
 * Dashboard "Top category this month" widget; `null`-safe (no spending recorded yet this month).
 * Exports: TopCategoryCard
 * Spec: docs/spec/05b §5.7 Bảng 21
 */
import type { DashboardTopCategory } from '@campuscoin/shared';
import { EmptyState } from '../../../components/EmptyState';
import { MoneyText } from '../../../components/MoneyText';
import { en } from '../../../i18n/en';

interface TopCategoryCardProps {
  topCategory: DashboardTopCategory | null;
}

/** "Top category this month" widget: name, amount and share of total spending. */
export function TopCategoryCard({ topCategory }: TopCategoryCardProps) {
  return (
    <div className="card h-100">
      <div className="card-body">
        <h2 className="h6">{en.dashboard.topCategory.title}</h2>
        {topCategory === null ? (
          <EmptyState icon="bi-tag" message={en.dashboard.topCategory.empty} />
        ) : (
          <div className="d-flex align-items-center gap-2">
            <span
              className="d-inline-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
              style={{ width: '2.5rem', height: '2.5rem', backgroundColor: topCategory.color ?? '#6c757d', color: '#fff' }}
            >
              <i className={`bi bi-${topCategory.icon || 'tag'} fs-5`} aria-hidden="true" />
            </span>
            <div>
              <div className="fw-semibold">{topCategory.name}</div>
              <div>
                <MoneyText amount={topCategory.amount} type="expense" />
              </div>
              <div className="small text-body-secondary">{en.dashboard.topCategory.share(topCategory.sharePct)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
