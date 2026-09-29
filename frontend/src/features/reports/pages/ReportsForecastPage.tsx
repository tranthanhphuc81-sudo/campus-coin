/**
 * ReportsForecastPage.tsx
 * Student spending forecast report page (`/app/reports/forecast`, P14, docs/spec/05c §5.14): a
 * 3-month-weighted-average + known-recurring-amount forecast for next month, with a +-1 stdDev
 * range — a lazy-loaded chart plus an always-visible table fallback (spec: "line chart + error
 * band, table fallback"). Bookmarking this view is wired from `ReportsLayout`'s header (the
 * `'forecast'` view has no filter params of its own, so its bookmark ref is just `"forecast"`).
 * Exports: default (ReportsForecastPage)
 * Spec: docs/spec/05c §5.14
 */
import { TransactionType, type CurrencyCode as CurrencyCodeType } from '@campuscoin/shared';
import { lazy, Suspense, useMemo, useState } from 'react';
import { CardSkeleton, ChartSkeleton } from '../../../components/Skeletons';
import { EmptyState } from '../../../components/EmptyState';
import { ErrorState } from '../../../components/ErrorState';
import { MoneyText } from '../../../components/MoneyText';
import { en } from '../../../i18n/en';
import { formatMonthLabel } from '../../../lib/dates';
import { ForecastTable } from '../components/ForecastTable';
import { useForecastNextMonthQuery } from '../hooks';

const ForecastBandChart = lazy(() => import('../components/charts/ForecastBandChart'));

/** "Forecast" report tab: next-month totals/range chart + always-visible per-category table. */
export default function ReportsForecastPage() {
  const query = useForecastNextMonthQuery();
  const [manualType, setManualType] = useState<TransactionType | null>(null);
  const data = query.data;

  const hasExpense = Boolean(data?.totals.expense);
  const hasIncome = Boolean(data?.totals.income);
  const type = manualType ?? (hasExpense ? TransactionType.EXPENSE : TransactionType.INCOME);
  const band = data ? (type === TransactionType.INCOME ? data.totals.income : data.totals.expense) : null;

  const categories = useMemo(() => (data ? data.categories.filter((c) => c.type === type) : []), [data, type]);
  const actualHistory = useMemo(
    () => (data ? data.history.map((h) => Number(type === TransactionType.INCOME ? h.income : h.expense)) : []),
    [data, type],
  );

  if (query.isLoading) {
    return (
      <div className="d-flex flex-column gap-3">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }
  if (query.isError || !data) {
    return <ErrorState onRetry={() => void query.refetch()} />;
  }
  if (data.insufficientData) {
    return <EmptyState icon="bi-graph-up" message={en.reports.forecast.insufficientData} />;
  }
  if ((!hasExpense && !hasIncome) || !band) {
    return <EmptyState icon="bi-graph-up" message={en.reports.forecast.empty} />;
  }

  const currency = data.currency as CurrencyCodeType;
  const monthLabel = formatMonthLabel(data.month);

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <p className="text-body-secondary mb-0">{en.reports.forecast.subtitle(monthLabel)}</p>
        {hasExpense && hasIncome ? (
          <div className="btn-group" role="group" aria-label={en.reports.forecast.title}>
            <button
              type="button"
              className={`btn btn-sm ${type === TransactionType.EXPENSE ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setManualType(TransactionType.EXPENSE)}
            >
              {en.reports.forecast.typeExpense}
            </button>
            <button
              type="button"
              className={`btn btn-sm ${type === TransactionType.INCOME ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setManualType(TransactionType.INCOME)}
            >
              {en.reports.forecast.typeIncome}
            </button>
          </div>
        ) : null}
      </div>

      <div className="card mb-3">
        <div className="card-body">
          <p className="mb-3">
            {en.reports.forecast.summaryPrefix(monthLabel)} <MoneyText amount={band.forecast} type={type} currency={currency} /> (
            <MoneyText amount={band.lower} currency={currency} />
            {' – '}
            <MoneyText amount={band.upper} currency={currency} />)
          </p>
          <div style={{ height: '20rem' }}>
            <Suspense fallback={<ChartSkeleton />}>
              <ForecastBandChart basisMonths={data.basisMonths} targetMonth={data.month} actualHistory={actualHistory} band={band} />
            </Suspense>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <h2 className="h6 mb-3">{en.reports.forecast.tableTitle}</h2>
          <ForecastTable categories={categories} currency={currency} />
        </div>
      </div>
    </div>
  );
}
