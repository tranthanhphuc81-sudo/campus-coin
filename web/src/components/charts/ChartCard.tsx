import type { PropsWithChildren, ReactNode } from "react";

type ChartCardProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  tableCaption: string;
  tableHeaders: string[];
  tableRows: Array<Array<string>>;
}>;

export default function ChartCard({
  title,
  subtitle,
  actions,
  tableCaption,
  tableHeaders,
  tableRows,
  children,
}: ChartCardProps) {
  return (
    <section className="chart-card panel" aria-label={title}>
      <header className="chart-card__header">
        <div>
          <h3 className="chart-card__title">{title}</h3>
          {subtitle ? <p className="chart-card__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="chart-card__actions">{actions}</div> : null}
      </header>

      <div className="chart-card__body">{children}</div>

      <div className="chart-card__sr-table">
        <table>
          <caption>{tableCaption}</caption>
          <thead>
            <tr>
              {tableHeaders.map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, rowIndex) => (
              <tr key={`${title}-row-${rowIndex}`}>
                {row.map((value, colIndex) => (
                  <td key={`${title}-cell-${rowIndex}-${colIndex}`}>{value}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
