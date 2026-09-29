/**
 * ForecastTable.tsx
 * Permanent table fallback for the "Forecast" report tab (P14, docs/spec/05c §5.14 — "line chart +
 * error band, table fallback"): per-category M-3/M-2/M-1 actuals, the known recurring amount,
 * next month's forecast and its +-1 stdDev range. A `null` history entry (no data that month)
 * renders as an em dash, distinct from a real `"0.00"` value.
 * Exports: ForecastTable
 * Spec: docs/spec/05c §5.14
 */
import type { CurrencyCode as CurrencyCodeType, ForecastCategoryDto } from '@campuscoin/shared';
import { MoneyText } from '../../../components/MoneyText';
import { en } from '../../../i18n/en';

interface ForecastTableProps {
  categories: ForecastCategoryDto[];
  currency: CurrencyCodeType;
}

/** Formats a money range like "$10.00 – $20.00", using the same currency as the rest of the report. */
function formatRange(lower: string, upper: string, currency: CurrencyCodeType): string {
  const format = (value: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value));
  return `${format(lower)} – ${format(upper)}`;
}

/** One history cell: an em dash for "no data that month", otherwise the money amount. */
function HistoryCell({ value, type, currency }: { value: string | null; type: ForecastCategoryDto['type']; currency: CurrencyCodeType }) {
  if (value === null) return <span className="text-body-secondary">{en.reports.forecast.noData}</span>;
  return <MoneyText amount={value} type={type} currency={currency} />;
}

/** Per-category forecast table: the always-visible, accessible companion to `ForecastBandChart`. */
export function ForecastTable({ categories, currency }: ForecastTableProps) {
  if (categories.length === 0) {
    return <p className="text-body-secondary mb-0">{en.reports.forecast.empty}</p>;
  }

  return (
    <div className="table-responsive">
      <table className="table table-sm align-middle">
        <caption className="visually-hidden">{en.reports.forecast.tableCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{en.reports.forecast.colCategory}</th>
            <th scope="col">{en.reports.forecast.colM3}</th>
            <th scope="col">{en.reports.forecast.colM2}</th>
            <th scope="col">{en.reports.forecast.colM1}</th>
            <th scope="col">{en.reports.forecast.colRecurring}</th>
            <th scope="col">{en.reports.forecast.colForecast}</th>
            <th scope="col">{en.reports.forecast.colRange}</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => (
            <tr key={category.categoryId}>
              <td>{category.name}</td>
              <td>
                <HistoryCell value={category.history[0] ?? null} type={category.type} currency={currency} />
              </td>
              <td>
                <HistoryCell value={category.history[1] ?? null} type={category.type} currency={currency} />
              </td>
              <td>
                <HistoryCell value={category.history[2] ?? null} type={category.type} currency={currency} />
              </td>
              <td>
                <MoneyText amount={category.recurring} type={category.type} currency={currency} />
              </td>
              <td className="fw-semibold">
                <MoneyText amount={category.forecast} type={category.type} currency={currency} />
              </td>
              <td>{formatRange(category.lower, category.upper, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
