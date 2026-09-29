/**
 * TipsCard.tsx
 * Dashboard "Saving tips" widget; `tips` is always `[]` until P13 builds the tips engine, so this
 * always renders the empty-state placeholder for now.
 * Exports: TipsCard
 * Spec: docs/spec/05b §5.7 Bảng 21
 */
import type { DashboardTipSummary } from '@campuscoin/shared';
import { Link } from 'react-router';
import { EmptyState } from '../../../components/EmptyState';
import { en } from '../../../i18n/en';

interface TipsCardProps {
  tips: DashboardTipSummary[];
}

/** "Saving tips" widget: top personalised tips, or a placeholder until P13. */
export function TipsCard({ tips }: TipsCardProps) {
  return (
    <div className="card h-100">
      <div className="card-body">
        <h2 className="h6">{en.dashboard.tips.title}</h2>
        {tips.length === 0 ? (
          <EmptyState icon="bi-piggy-bank" message={en.dashboard.tips.empty} />
        ) : (
          <>
            <ul className="list-unstyled mb-2">
              {tips.map((tip) => (
                <li key={tip.id}>{tip.title}</li>
              ))}
            </ul>
            <Link to="/app/tips" className="small">
              {en.dashboard.tips.viewAll}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
