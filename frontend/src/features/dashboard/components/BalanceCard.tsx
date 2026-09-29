/**
 * BalanceCard.tsx
 * Dashboard "This month" balance widget: income/expense/net totals plus % change vs last month.
 * `incomeChangePct`/`expenseChangePct` are `null` when there is no previous-month data to compare
 * against (division by zero) — shown as a neutral "no data" line rather than a fake 0%.
 * Exports: BalanceCard
 * Spec: docs/spec/05b §5.7 Bảng 21
 */
import type { DashboardTotals } from '@campuscoin/shared';
import { MoneyText } from '../../../components/MoneyText';
import { en } from '../../../i18n/en';

interface BalanceCardProps {
  totals: DashboardTotals;
}

/**
 * `MoneyText` expects a non-negative magnitude plus an explicit `type` to determine sign/colour —
 * it does not itself inspect a negative amount string. `net` can genuinely be negative (expenses
 * exceeded income), so derive the sign/colour from `net`'s own value here rather than hardcoding
 * one, and pass the absolute magnitude through.
 */
function netMoneyProps(net: string): { amount: string; type?: 'income' | 'expense' } {
  const numeric = Number(net);
  if (numeric < 0) return { amount: Math.abs(numeric).toFixed(2), type: 'expense' };
  if (numeric > 0) return { amount: net, type: 'income' };
  return { amount: net };
}

/** "This month" balance widget: income/expense/net + % change vs last month. */
export function BalanceCard({ totals }: BalanceCardProps) {
  return (
    <div className="card h-100">
      <div className="card-body">
        <h2 className="h6">{en.dashboard.balance.title}</h2>
        <dl className="row mb-0">
          <dt className="col-6 fw-normal text-body-secondary">{en.dashboard.balance.income}</dt>
          <dd className="col-6 text-end mb-1">
            <MoneyText amount={totals.income} type="income" />
            {totals.incomeChangePct !== null ? (
              <div className="small text-body-secondary">{en.dashboard.balance.vsLastMonth(totals.incomeChangePct)}</div>
            ) : null}
          </dd>
          <dt className="col-6 fw-normal text-body-secondary">{en.dashboard.balance.expense}</dt>
          <dd className="col-6 text-end mb-1">
            <MoneyText amount={totals.expense} type="expense" />
            {totals.expenseChangePct !== null ? (
              <div className="small text-body-secondary">{en.dashboard.balance.vsLastMonth(totals.expenseChangePct)}</div>
            ) : null}
          </dd>
          <dt className="col-6 fw-semibold">{en.dashboard.balance.net}</dt>
          <dd className="col-6 text-end fw-semibold mb-0">
            <MoneyText {...netMoneyProps(totals.net)} />
          </dd>
        </dl>
      </div>
    </div>
  );
}
