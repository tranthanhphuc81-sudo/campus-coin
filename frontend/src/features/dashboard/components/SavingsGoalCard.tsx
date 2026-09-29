/**
 * SavingsGoalCard.tsx
 * Dashboard "Savings goal" widget; `null`-safe (the user has not set `monthlySavingsGoal` yet).
 * Exports: SavingsGoalCard
 * Spec: docs/spec/05b §5.7 Bảng 21
 */
import type { DashboardSavingsGoal } from '@campuscoin/shared';
import { Link } from 'react-router';
import { MoneyText } from '../../../components/MoneyText';
import { en } from '../../../i18n/en';

interface SavingsGoalCardProps {
  savingsGoal: DashboardSavingsGoal | null;
}

/** "Savings goal" widget: progress bar toward `monthlySavingsGoal`, or a setup prompt if unset. */
export function SavingsGoalCard({ savingsGoal }: SavingsGoalCardProps) {
  return (
    <div className="card h-100">
      <div className="card-body">
        <h2 className="h6">{en.dashboard.savingsGoal.title}</h2>
        {savingsGoal === null ? (
          <p className="text-body-secondary small mb-0">
            {en.dashboard.savingsGoal.empty} <Link to="/app/profile">{en.nav.profile}</Link>
          </p>
        ) : (
          <>
            <div className="d-flex justify-content-between small mb-1">
              <span>
                <MoneyText amount={savingsGoal.progressAmount} /> / <MoneyText amount={savingsGoal.targetAmount} />
              </span>
              {savingsGoal.progressPct !== null ? <span className="fw-semibold">{en.dashboard.savingsGoal.progressLabel(savingsGoal.progressPct)}</span> : null}
            </div>
            <div
              className="progress"
              role="progressbar"
              aria-valuenow={Math.min(100, savingsGoal.progressPct ?? 0)}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{ height: '0.75rem' }}
            >
              <div className="progress-bar bg-success" style={{ width: `${Math.min(100, savingsGoal.progressPct ?? 0)}%` }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
