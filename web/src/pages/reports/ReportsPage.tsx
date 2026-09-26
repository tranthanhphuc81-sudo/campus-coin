import { toPng } from "html-to-image";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";

import { DoughnutChart, GroupedBarChart, LineChart } from "@/components/charts";
import LoadingButton from "@/components/common/LoadingButton";
import BookmarkButton from "@/components/bookmarks/BookmarkButton";
import { en } from "@/content/en";
import {
  exportMonthlyReportPdf,
  useCategoryBreakdownReport,
  useDailyWeeklyReport,
  useIncomeVsExpenseReport,
  useNextMonthForecast,
  useShareMonthlyReport,
} from "@/features/analytics/hooks";
import { useCategories } from "@/features/categories/hooks";
import { formatMoney } from "@/lib/money";
import { parseProblem } from "@/lib/problem";

type ReportTab = "category" | "income-expense" | "daily-weekly" | "forecast";
type DateRangePreset = "this-month" | "last-month" | "last-3-months" | "last-6-months";
type ReportSourceFilter = "all" | "manual" | "recurring" | "csv_import";

type DateRange = {
  from: string;
  to: string;
};

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toIsoMonth(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function createPresetRange(preset: DateRangePreset): DateRange {
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  if (preset === "this-month") {
    return {
      from: toIsoDate(startOfMonth),
      to: toIsoDate(now),
    };
  }

  if (preset === "last-month") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    return { from: toIsoDate(start), to: toIsoDate(end) };
  }

  const monthsBack = preset === "last-3-months" ? 2 : 5;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, 1));
  return {
    from: toIsoDate(start),
    to: toIsoDate(now),
  };
}

function sanitizeTab(value: string | null): ReportTab {
  if (
    value === "category" ||
    value === "income-expense" ||
    value === "daily-weekly" ||
    value === "forecast"
  ) {
    return value;
  }

  return "category";
}

function sanitizePreset(value: string | null): DateRangePreset {
  if (
    value === "this-month" ||
    value === "last-month" ||
    value === "last-3-months" ||
    value === "last-6-months"
  ) {
    return value;
  }

  return "this-month";
}

function sanitizeSource(value: string | null): ReportSourceFilter {
  if (value === "manual" || value === "recurring" || value === "csv_import") {
    return value;
  }

  return "all";
}

function downloadDataUrl(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
}

export default function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfExportError, setPdfExportError] = useState<string | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareSuccess, setShareSuccess] = useState<string | null>(null);
  const reportAreaRef = useRef<HTMLDivElement | null>(null);
  const shareMonthlyReportMutation = useShareMonthlyReport();

  const tab = sanitizeTab(searchParams.get("tab"));
  const preset = sanitizePreset(searchParams.get("range"));
  const range = createPresetRange(preset);
  const type = searchParams.get("type") === "income" ? "income" : "expense";
  const categoryIds = (searchParams.get("categoryIds") ?? "")
    .split(",")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
  const categoryId = categoryIds[0];
  const source = sanitizeSource(searchParams.get("source"));
  const month = searchParams.get("month") ?? toIsoMonth(new Date());

  const categoriesQuery = useCategories(type);

  const categoryReportQuery = useCategoryBreakdownReport(
    {
      from: range.from,
      to: range.to,
      type,
      categoryId,
    },
    tab === "category",
  );

  const incomeExpenseQuery = useIncomeVsExpenseReport(6, tab === "income-expense");
  const dailyWeeklyQuery = useDailyWeeklyReport(month, tab === "daily-weekly");
  const forecastQuery = useNextMonthForecast(tab === "forecast");

  const forecastItems = useMemo(() => {
    const items = forecastQuery.data?.items ?? [];
    const byType = items.filter((item) => item.type === type);
    if (categoryIds.length === 0) {
      return byType;
    }

    return byType.filter((item) => categoryIds.includes(item.categoryId));
  }, [categoryIds, forecastQuery.data?.items, type]);

  const categorySeries = useMemo(() => {
    const items = categoryReportQuery.data?.items ?? [];
    return items.map((item) => ({
      label: item.categoryName,
      value: item.amount,
    }));
  }, [categoryReportQuery.data?.items]);

  const reportBookmarkRef = useMemo(() => {
    const serialized = searchParams.toString();
    return serialized.length > 0
      ? serialized
      : "tab=category&range=this-month&type=expense&source=all";
  }, [searchParams]);

  const updateFilters = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams);

    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    setSearchParams(params, { replace: true });
  };

  const exportPng = async () => {
    if (!reportAreaRef.current) {
      return;
    }

    setExportError(null);
    setIsExporting(true);

    try {
      const dataUrl = await toPng(reportAreaRef.current, {
        cacheBust: true,
        backgroundColor: "transparent",
        pixelRatio: 2,
      });
      downloadDataUrl(dataUrl, `campus-coin-report-${tab}.png`);
    } catch {
      setExportError(en.reports.messages.exportPngFailed);
    } finally {
      setIsExporting(false);
    }
  };

  const exportPdf = async () => {
    setPdfExportError(null);
    setIsExportingPdf(true);

    try {
      const blob = await exportMonthlyReportPdf(month);
      const url = URL.createObjectURL(blob);
      downloadDataUrl(url, `campus-coin-report-${month}.pdf`);
      URL.revokeObjectURL(url);
    } catch {
      setPdfExportError(en.reports.messages.exportPdfFailed);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const openShareModal = () => {
    setShareEmail("");
    setShareError(null);
    setShareSuccess(null);
    setIsShareModalOpen(true);
  };

  const closeShareModal = () => {
    setIsShareModalOpen(false);
  };

  const submitShareReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setShareError(null);

    try {
      await shareMonthlyReportMutation.mutateAsync({ month, toEmail: shareEmail });
      setShareSuccess(en.reports.messages.shareSuccess);
    } catch (error) {
      const problem = parseProblem(error);
      setShareError(problem.detail || en.reports.messages.shareFailed);
    }
  };

  return (
    <section className="reports-page" aria-labelledby="reports-page-title">
      <header className="reports-page__header">
        <div>
          <h1 id="reports-page-title">{en.reports.title}</h1>
          <p>{en.reports.subtitle}</p>
        </div>

        <button
          type="button"
          className="btn btn-outline"
          onClick={() => {
            void exportPng();
          }}
          disabled={isExporting}
        >
          {isExporting ? en.common.loadingLabel : en.reports.exportPngAction}
        </button>

        <button
          type="button"
          className="btn btn-outline"
          onClick={() => {
            void exportPdf();
          }}
          disabled={isExportingPdf}
        >
          {isExportingPdf ? en.common.loadingLabel : en.reports.exportPdfAction}
        </button>

        <button type="button" className="btn btn-outline" onClick={openShareModal}>
          {en.reports.shareEmailAction}
        </button>

        <BookmarkButton
          targetType="report"
          targetRef={reportBookmarkRef}
          ariaLabel={en.reports.bookmarkAction}
        />
      </header>

      {pdfExportError ? <p className="flash-error">{pdfExportError}</p> : null}

      {isShareModalOpen ? (
        <div className="dialog-backdrop" role="presentation">
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-report-dialog-title"
          >
            <h2 id="share-report-dialog-title">{en.reports.shareModal.title}</h2>
            <p>{en.reports.shareModal.description}</p>

            <form
              className="form-stack"
              onSubmit={(event) => {
                void submitShareReport(event);
              }}
              noValidate
            >
              <div className="form-field">
                <label htmlFor="share-report-email">{en.reports.shareModal.emailLabel}</label>
                <input
                  id="share-report-email"
                  type="email"
                  required
                  value={shareEmail}
                  onChange={(event) => setShareEmail(event.target.value)}
                />
              </div>

              {shareError ? (
                <p className="form-error" role="alert">
                  {shareError}
                </p>
              ) : null}

              {shareSuccess ? <p role="status">{shareSuccess}</p> : null}

              <div className="dialog-actions">
                <button type="button" className="btn btn-outline" onClick={closeShareModal}>
                  {en.reports.shareModal.cancelAction}
                </button>
                <LoadingButton
                  type="submit"
                  isLoading={shareMonthlyReportMutation.isPending}
                  loadingLabel={en.common.loadingLabel}
                >
                  {en.reports.shareModal.submitAction}
                </LoadingButton>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <div className="reports-filters panel">
        <div className="form-field">
          <label htmlFor="reports-range">{en.reports.filters.rangeLabel}</label>
          <select
            id="reports-range"
            className="field-select"
            value={preset}
            onChange={(event) => updateFilters({ range: event.target.value })}
          >
            <option value="this-month">{en.reports.filters.thisMonth}</option>
            <option value="last-month">{en.reports.filters.lastMonth}</option>
            <option value="last-3-months">{en.reports.filters.last3Months}</option>
            <option value="last-6-months">{en.reports.filters.last6Months}</option>
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="reports-type">{en.reports.filters.typeLabel}</label>
          <select
            id="reports-type"
            className="field-select"
            value={type}
            onChange={(event) => updateFilters({ type: event.target.value, categoryId: undefined })}
          >
            <option value="expense">{en.categories.expenseTab}</option>
            <option value="income">{en.categories.incomeTab}</option>
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="reports-category">{en.reports.filters.categoryLabel}</label>
          <select
            id="reports-category"
            className="field-select"
            value={categoryIds.map(String)}
            multiple
            onChange={(event) => {
              const selected = Array.from(event.target.selectedOptions).map(
                (option) => option.value,
              );
              updateFilters({ categoryIds: selected.length > 0 ? selected.join(",") : undefined });
            }}
          >
            {(categoriesQuery.data ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="reports-month">{en.reports.filters.monthLabel}</label>
          <input
            id="reports-month"
            type="month"
            value={month}
            onChange={(event) => updateFilters({ month: event.target.value })}
          />
        </div>

        <div className="form-field">
          <label htmlFor="reports-source">{en.reports.filters.sourceLabel}</label>
          <select
            id="reports-source"
            className="field-select"
            value={source}
            onChange={(event) => updateFilters({ source: event.target.value })}
          >
            <option value="all">{en.reports.filters.allSources}</option>
            <option value="manual">{en.reports.filters.manualSource}</option>
            <option value="recurring">{en.reports.filters.recurringSource}</option>
            <option value="csv_import">{en.reports.filters.csvSource}</option>
          </select>
        </div>
      </div>

      <div className="reports-tabs" role="tablist" aria-label={en.reports.tabsAriaLabel}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "category"}
          className={tab === "category" ? "is-active" : ""}
          onClick={() => updateFilters({ tab: "category" })}
        >
          {en.reports.tabs.categoryBreakdown}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "income-expense"}
          className={tab === "income-expense" ? "is-active" : ""}
          onClick={() => updateFilters({ tab: "income-expense" })}
        >
          {en.reports.tabs.incomeVsExpense}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "daily-weekly"}
          className={tab === "daily-weekly" ? "is-active" : ""}
          onClick={() => updateFilters({ tab: "daily-weekly" })}
        >
          {en.reports.tabs.dailyWeekly}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "forecast"}
          className={tab === "forecast" ? "is-active" : ""}
          onClick={() => updateFilters({ tab: "forecast" })}
        >
          {en.reports.tabs.forecast}
        </button>
      </div>

      {exportError ? <p className="flash-error">{exportError}</p> : null}

      <div className="reports-content" ref={reportAreaRef}>
        {tab === "category" ? (
          categoryReportQuery.isLoading ? (
            <p>{en.common.loadingLabel}</p>
          ) : (
            <>
              <DoughnutChart
                title={en.reports.tabs.categoryBreakdown}
                subtitle={`${range.from} - ${range.to}`}
                caption={en.reports.a11y.categoryTableCaption}
                data={categorySeries}
              />
              <section className="panel reports-summary-card">
                <h3>{en.reports.summaryTitle}</h3>
                <p>
                  {en.reports.totalAmountLabel}:{" "}
                  {formatMoney(categoryReportQuery.data?.totalAmount ?? "0")}
                </p>
                <p>
                  {en.reports.totalTransactionsLabel}:{" "}
                  {categoryReportQuery.data?.totalTransactions ?? 0}
                </p>
              </section>
            </>
          )
        ) : null}

        {tab === "income-expense" ? (
          incomeExpenseQuery.isLoading ? (
            <p>{en.common.loadingLabel}</p>
          ) : (
            <GroupedBarChart
              title={en.reports.tabs.incomeVsExpense}
              subtitle={en.reports.sixMonthsSubtitle}
              labels={(incomeExpenseQuery.data?.data ?? []).map((row) => row.month)}
              series={[
                {
                  label: en.reports.series.income,
                  values: (incomeExpenseQuery.data?.data ?? []).map((row) => row.income),
                },
                {
                  label: en.reports.series.expense,
                  values: (incomeExpenseQuery.data?.data ?? []).map((row) => row.expense),
                },
                {
                  label: en.reports.series.net,
                  values: (incomeExpenseQuery.data?.data ?? []).map((row) => row.net),
                },
              ]}
              caption={en.reports.a11y.incomeExpenseTableCaption}
            />
          )
        ) : null}

        {tab === "daily-weekly" ? (
          dailyWeeklyQuery.isLoading ? (
            <p>{en.common.loadingLabel}</p>
          ) : (
            <>
              <LineChart
                title={en.reports.dailyChartTitle}
                subtitle={month}
                labels={(dailyWeeklyQuery.data?.daily ?? []).map((row) => row.date)}
                series={[
                  {
                    label: en.reports.series.income,
                    values: (dailyWeeklyQuery.data?.daily ?? []).map((row) => row.income),
                  },
                  {
                    label: en.reports.series.expense,
                    values: (dailyWeeklyQuery.data?.daily ?? []).map((row) => row.expense),
                  },
                  {
                    label: en.reports.series.net,
                    values: (dailyWeeklyQuery.data?.daily ?? []).map((row) => row.net),
                  },
                ]}
                caption={en.reports.a11y.dailyWeeklyTableCaption}
              />
              <GroupedBarChart
                title={en.reports.weeklyChartTitle}
                subtitle={month}
                labels={(dailyWeeklyQuery.data?.weekly ?? []).map((row) => row.isoWeek)}
                series={[
                  {
                    label: en.reports.series.income,
                    values: (dailyWeeklyQuery.data?.weekly ?? []).map((row) => row.income),
                  },
                  {
                    label: en.reports.series.expense,
                    values: (dailyWeeklyQuery.data?.weekly ?? []).map((row) => row.expense),
                  },
                ]}
                caption={en.reports.a11y.weeklyTableCaption}
              />
            </>
          )
        ) : null}

        {tab === "forecast" ? (
          forecastQuery.isLoading ? (
            <p>{en.common.loadingLabel}</p>
          ) : forecastQuery.data?.insufficientData ? (
            <section className="panel reports-placeholder">
              <h3>{en.reports.tabs.forecast}</h3>
              <p>{en.reports.forecastNotEnoughData}</p>
            </section>
          ) : (
            <LineChart
              title={en.reports.tabs.forecast}
              subtitle={forecastQuery.data?.month}
              labels={forecastItems.map((item) => item.categoryName)}
              series={[
                {
                  label: en.reports.forecastSeries.lower,
                  values: forecastItems.map((item) => item.lowerBound),
                  borderWidth: 1,
                  pointRadius: 1,
                },
                {
                  label: en.reports.forecastSeries.upper,
                  values: forecastItems.map((item) => item.upperBound),
                  borderWidth: 1,
                  pointRadius: 1,
                  fill: "-1",
                  backgroundColor: "rgba(68, 138, 255, 0.18)",
                  borderColor: "rgba(68, 138, 255, 0.7)",
                },
                {
                  label: en.reports.forecastSeries.predicted,
                  values: forecastItems.map((item) => item.predictedAmount),
                  borderWidth: 2,
                  pointRadius: 2,
                  borderColor: "#1458d8",
                  backgroundColor: "#1458d8",
                },
              ]}
              caption={en.reports.a11y.forecastTableCaption}
            />
          )
        ) : null}
      </div>
    </section>
  );
}
