/**
 * RecentActivityCard.tsx
 * Dashboard "Recent activity" widget (P14, docs/spec/05b §5.7 Bảng 21): up to
 * `DASHBOARD_RECENT_ACTIVITY_N` most recently viewed/edited transactions. Each row links to
 * `/app/transactions?open=<id>`, which `TransactionsPage` reads on mount to open that transaction's
 * detail drawer directly.
 * Exports: RecentActivityCard
 * Spec: docs/spec/05b §5.7 Bảng 21 · docs/spec/05c §5.14
 */
import type { DashboardRecentActivityItem } from '@campuscoin/shared';
import { Link } from 'react-router';
import { EmptyState } from '../../../components/EmptyState';
import { MoneyText } from '../../../components/MoneyText';
import { en } from '../../../i18n/en';

interface RecentActivityCardProps {
  activity: DashboardRecentActivityItem[];
}

/** "Recent activity" widget: recently viewed/edited transactions, each linking to its drawer. */
export function RecentActivityCard({ activity }: RecentActivityCardProps) {
  return (
    <div className="card h-100">
      <div className="card-body">
        <h2 className="h6">{en.dashboard.recentActivity.title}</h2>
        {activity.length === 0 ? (
          <EmptyState icon="bi-clock-history" message={en.dashboard.recentActivity.empty} />
        ) : (
          <ul className="list-unstyled mb-0">
            {activity.map((item) => (
              <li key={item.transactionId} className="mb-2">
                <Link
                  to={`/app/transactions?open=${item.transactionId}`}
                  className="d-flex justify-content-between align-items-center gap-2 text-decoration-none text-body"
                >
                  <span>
                    <span className="d-block">{item.description ?? en.transactions.table.noDescription}</span>
                    <small className="text-body-secondary">
                      {item.action === 'edited' ? en.activity.editedLabel : en.activity.viewedLabel}
                    </small>
                  </span>
                  <MoneyText amount={item.amount} type={item.type} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
