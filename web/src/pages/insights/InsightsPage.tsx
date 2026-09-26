import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import BookmarkButton from "@/components/bookmarks/BookmarkButton";
import { en } from "@/content/en";
import { useInsightDetail, useInsightsList, useRegenerateInsight } from "@/features/insights/hooks";
import { parseProblem } from "@/lib/problem";

export default function InsightsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const insightsQuery = useInsightsList();
  const regenerateMutation = useRegenerateInsight();
  const [regenerateMessage, setRegenerateMessage] = useState<string | null>(null);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);

  const items = useMemo(() => insightsQuery.data ?? [], [insightsQuery.data]);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(searchParams.get("month"));

  const effectiveSelectedMonth = useMemo(() => {
    if (selectedMonth && items.some((item) => item.month === selectedMonth)) {
      return selectedMonth;
    }

    return items[0]?.month ?? null;
  }, [items, selectedMonth]);

  useEffect(() => {
    const monthFromQuery = searchParams.get("month");
    if (monthFromQuery && monthFromQuery !== selectedMonth) {
      setSelectedMonth(monthFromQuery);
    }
  }, [searchParams, selectedMonth]);

  useEffect(() => {
    if (!effectiveSelectedMonth) {
      return;
    }

    if (searchParams.get("month") === effectiveSelectedMonth) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("month", effectiveSelectedMonth);
    setSearchParams(nextParams, { replace: true });
  }, [effectiveSelectedMonth, searchParams, setSearchParams]);

  const detailQuery = useInsightDetail(effectiveSelectedMonth);
  const detail = detailQuery.data;

  const regenerate = async () => {
    if (!effectiveSelectedMonth) {
      return;
    }

    setRegenerateMessage(null);
    setRegenerateError(null);

    try {
      await regenerateMutation.mutateAsync(effectiveSelectedMonth);
      setRegenerateMessage(en.insights.messages.regenerateAccepted);
    } catch (error) {
      const problem = parseProblem(error);
      setRegenerateError(problem.detail || en.insights.messages.regenerateFailed);
    }
  };

  return (
    <section className="insights-page" aria-labelledby="insights-page-title">
      <header className="insights-page__header">
        <h1 id="insights-page-title">{en.insights.title}</h1>
        <p>{en.insights.subtitle}</p>
      </header>

      <div className="insights-layout">
        <aside className="panel insights-list" aria-label={en.insights.historyAriaLabel}>
          <h2>{en.insights.historyTitle}</h2>

          {insightsQuery.isLoading ? <p>{en.common.loadingLabel}</p> : null}
          {insightsQuery.isError ? <p>{en.common.genericErrorDetail}</p> : null}
          {!insightsQuery.isLoading && items.length === 0 ? <p>{en.insights.emptyState}</p> : null}

          <ul>
            {items.map((item) => (
              <li key={item.month}>
                <button
                  type="button"
                  className={item.month === effectiveSelectedMonth ? "is-active" : ""}
                  onClick={() => {
                    setSelectedMonth(item.month);
                    const nextParams = new URLSearchParams(searchParams);
                    nextParams.set("month", item.month);
                    setSearchParams(nextParams, { replace: true });
                  }}
                >
                  <span>{item.month}</span>
                  <small>{item.status}</small>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <article className="panel insights-detail">
          {!effectiveSelectedMonth ? <p>{en.insights.emptyState}</p> : null}
          {effectiveSelectedMonth && detailQuery.isLoading ? <p>{en.common.loadingLabel}</p> : null}
          {effectiveSelectedMonth && detailQuery.isError ? (
            <p>{en.common.genericErrorDetail}</p>
          ) : null}

          {detail ? (
            <>
              <header className="insights-detail__header">
                <div>
                  <h2>{detail.month}</h2>
                  <p className="dashboard-widget__meta">{en.insights.aiLabel}</p>
                </div>

                <div className="insights-detail__actions">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => {
                      void regenerate();
                    }}
                    disabled={regenerateMutation.isPending}
                  >
                    {en.insights.actions.regenerate}
                  </button>

                  <BookmarkButton
                    targetType="insight"
                    targetRef={detail.month}
                    ariaLabel={en.insights.actions.bookmark}
                  />
                </div>
              </header>

              {regenerateMessage ? <p className="flash-success">{regenerateMessage}</p> : null}
              {regenerateError ? <p className="flash-error">{regenerateError}</p> : null}

              <section className="insight-copy-block">
                <h3>{en.insights.summaryTitle}</h3>
                <p>{detail.summaryText}</p>
              </section>

              <section className="insight-copy-block">
                <h3>{en.insights.tipTitle}</h3>
                <p>{detail.tipText}</p>
              </section>

              <section>
                <h3>{en.insights.flaggedTitle}</h3>
                {detail.flaggedPatterns.length === 0 ? (
                  <p>{en.insights.noFlaggedPatterns}</p>
                ) : null}

                <div className="insights-flagged-grid">
                  {detail.flaggedPatterns.map((pattern) => (
                    <article
                      key={`${detail.month}-${pattern.categoryId}`}
                      className="insight-pattern-card"
                    >
                      <h4>{pattern.name}</h4>
                      <p>
                        {en.insights.patternLabels.current}: {pattern.cur}
                      </p>
                      <p>
                        {en.insights.patternLabels.avg3}: {pattern.avg3 ?? en.insights.notAvailable}
                      </p>
                      <p>
                        {en.insights.patternLabels.growth}:{" "}
                        {pattern.g === null
                          ? en.insights.notAvailable
                          : `${(pattern.g * 100).toFixed(0)}%`}
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            </>
          ) : null}
        </article>
      </div>
    </section>
  );
}
