/**
 * LatestInsightCard.tsx
 * Dashboard "Latest insight" widget; `latestInsight` is always `null` until P13 builds monthly
 * AI insight generation, so this always renders the empty-state placeholder for now.
 * Exports: LatestInsightCard
 * Spec: docs/spec/05b §5.7 Bảng 21
 */
import type { DashboardInsightSummary } from '@campuscoin/shared';
import { Link } from 'react-router';
import { EmptyState } from '../../../components/EmptyState';
import { en } from '../../../i18n/en';

interface LatestInsightCardProps {
  insight: DashboardInsightSummary | null;
}

/** "Latest insight" widget: this month's AI-generated summary, or a placeholder until P13. */
export function LatestInsightCard({ insight }: LatestInsightCardProps) {
  return (
    <div className="card h-100">
      <div className="card-body">
        <h2 className="h6">{en.dashboard.latestInsight.title}</h2>
        {insight === null ? (
          <EmptyState icon="bi-stars" message={en.dashboard.latestInsight.empty} />
        ) : (
          <>
            <p className="mb-2">{insight.summaryText}</p>
            <Link to="/app/insights" className="small">
              {en.dashboard.latestInsight.viewHistory}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
