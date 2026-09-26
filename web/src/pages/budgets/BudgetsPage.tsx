import { useMemo, useState } from "react";

import { en } from "@/content/en";
import {
  useBudgets,
  useCopyPreviousBudgets,
  useDeleteBudget,
  useUpsertBudgets,
} from "@/features/budgets/hooks";
import { formatMoney } from "@/lib/money";
import { parseProblem } from "@/lib/problem";

type BudgetDraft = {
  limitAmount: string;
  alertThresholdPct: number;
};

function toMonthInput(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function normalizeMonthToApi(monthInput: string): string {
  return monthInput;
}

function visualState(percent: number): "ok" | "near" | "exceeded" {
  if (percent >= 100) {
    return "exceeded";
  }

  if (percent >= 80) {
    return "near";
  }

  return "ok";
}

export default function BudgetsPage() {
  const [month, setMonth] = useState(() => toMonthInput(new Date()));
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [draftsByMonth, setDraftsByMonth] = useState<Record<string, Record<number, BudgetDraft>>>(
    {},
  );

  const apiMonth = normalizeMonthToApi(month);

  const budgetsQuery = useBudgets(apiMonth);
  const upsertMutation = useUpsertBudgets();
  const copyMutation = useCopyPreviousBudgets();
  const deleteMutation = useDeleteBudget();

  const rows = useMemo(() => budgetsQuery.data ?? [], [budgetsQuery.data]);

  const defaultDrafts = useMemo(() => {
    const mapped: Record<number, BudgetDraft> = {};

    for (const row of rows) {
      mapped[row.categoryId] = {
        limitAmount: row.limitAmount === "0.00" ? "" : row.limitAmount,
        alertThresholdPct: row.alertThresholdPct,
      };
    }

    return mapped;
  }, [rows]);

  const drafts = draftsByMonth[apiMonth] ?? defaultDrafts;

  const hasPendingChanges = useMemo(
    () =>
      rows.some((row) => {
        const draft = drafts[row.categoryId];
        if (!draft) {
          return false;
        }

        const normalizedLimit = draft.limitAmount.trim();
        const sourceLimit = row.limitAmount === "0.00" ? "" : row.limitAmount;
        return normalizedLimit !== sourceLimit || draft.alertThresholdPct !== row.alertThresholdPct;
      }),
    [drafts, rows],
  );

  const updateDraft = (categoryId: number, updater: (current: BudgetDraft) => BudgetDraft) => {
    setDraftsByMonth((prev) => {
      const currentMonthDrafts = prev[apiMonth] ?? defaultDrafts;
      const current = currentMonthDrafts[categoryId] ?? {
        limitAmount: "",
        alertThresholdPct: 80,
      };

      return {
        ...prev,
        [apiMonth]: {
          ...currentMonthDrafts,
          [categoryId]: updater(current),
        },
      };
    });
  };

  const clearDraftForMonth = () => {
    setDraftsByMonth((prev) => {
      if (!(apiMonth in prev)) {
        return prev;
      }

      const next = { ...prev };
      delete next[apiMonth];
      return next;
    });
  };

  const saveBudgets = async () => {
    setFlashMessage(null);

    const items = rows
      .map((row) => {
        const draft = drafts[row.categoryId];
        if (!draft) {
          return null;
        }

        const normalizedLimit = draft.limitAmount.trim();
        if (!normalizedLimit) {
          return null;
        }

        return {
          categoryId: row.categoryId,
          limitAmount: normalizedLimit,
          alertThresholdPct: draft.alertThresholdPct,
        };
      })
      .filter(
        (item): item is { categoryId: number; limitAmount: string; alertThresholdPct: number } =>
          Boolean(item),
      );

    if (items.length === 0) {
      setFlashMessage(en.budgets.messages.noRowsToSave);
      return;
    }

    try {
      await upsertMutation.mutateAsync({
        month: apiMonth,
        items,
      });
      clearDraftForMonth();
      setFlashMessage(en.budgets.messages.saved);
    } catch (error) {
      const problem = parseProblem(error);
      setFlashMessage(problem.detail || en.budgets.messages.saveFailed);
    }
  };

  const copyPrevious = async () => {
    setFlashMessage(null);

    try {
      const result = await copyMutation.mutateAsync({ month: apiMonth });
      clearDraftForMonth();
      setFlashMessage(
        result.copied > 0
          ? en.budgets.messages.copied.replace("{count}", String(result.copied))
          : en.budgets.messages.nothingToCopy,
      );
    } catch (error) {
      const problem = parseProblem(error);
      setFlashMessage(problem.detail || en.budgets.messages.copyFailed);
    }
  };

  return (
    <section className="budgets-page">
      <header className="budgets-page__header">
        <div>
          <h1>{en.budgets.title}</h1>
          <p>{en.budgets.subtitle}</p>
        </div>

        <div className="budgets-page__actions">
          <label htmlFor="budget-month">{en.budgets.monthLabel}</label>
          <input
            id="budget-month"
            type="month"
            value={month}
            onChange={(event) => {
              setMonth(event.target.value);
            }}
          />
          <button type="button" className="btn btn-outline" onClick={() => void copyPrevious()}>
            {en.budgets.copyPreviousAction}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!hasPendingChanges || upsertMutation.isPending}
            onClick={() => {
              void saveBudgets();
            }}
          >
            {upsertMutation.isPending ? en.common.loadingLabel : en.budgets.saveAction}
          </button>
        </div>
      </header>

      {flashMessage ? <p className="flash-success">{flashMessage}</p> : null}

      {budgetsQuery.isLoading ? <p>{en.common.loadingLabel}</p> : null}

      <div className="budgets-table-wrapper">
        <table className="budgets-table">
          <thead>
            <tr>
              <th>{en.budgets.table.categoryColumn}</th>
              <th>{en.budgets.table.limitColumn}</th>
              <th>{en.budgets.table.thresholdColumn}</th>
              <th>{en.budgets.table.progressColumn}</th>
              <th>{en.budgets.table.actionsColumn}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const draft = drafts[row.categoryId] ?? {
                limitAmount: row.limitAmount === "0.00" ? "" : row.limitAmount,
                alertThresholdPct: row.alertThresholdPct,
              };

              const progressPercent = Math.max(0, Math.min(row.percent, 100));
              const viewState = visualState(row.percent);
              const progressLabel =
                viewState === "exceeded"
                  ? en.budgets.progress.exceeded
                  : viewState === "near"
                    ? en.budgets.progress.near
                    : en.budgets.progress.ok;

              return (
                <tr key={row.categoryId}>
                  <td>{row.categoryName}</td>
                  <td>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={draft.limitAmount}
                      placeholder="0.00"
                      aria-label={`${en.budgets.table.limitColumn} ${row.categoryName}`}
                      onChange={(event) => {
                        const nextLimit = event.target.value;
                        updateDraft(row.categoryId, () => ({
                          limitAmount: nextLimit,
                          alertThresholdPct: draft.alertThresholdPct,
                        }));
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={50}
                      max={100}
                      value={draft.alertThresholdPct}
                      aria-label={`${en.budgets.table.thresholdColumn} ${row.categoryName}`}
                      onChange={(event) => {
                        const nextThreshold = Number(event.target.value);
                        updateDraft(row.categoryId, () => ({
                          limitAmount: draft.limitAmount,
                          alertThresholdPct: Number.isFinite(nextThreshold) ? nextThreshold : 80,
                        }));
                      }}
                    />
                  </td>
                  <td>
                    <div className={`budget-progress budget-progress--${viewState}`}>
                      <div
                        className="budget-progress__bar"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <p className="budget-progress__text">
                      {formatMoney(row.spent)} / {formatMoney(row.limitAmount)} ·{" "}
                      {row.percent.toFixed(2)}% · {progressLabel}
                    </p>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={row.id <= 0 || deleteMutation.isPending}
                      onClick={() => {
                        if (row.id > 0) {
                          void deleteMutation.mutateAsync({ id: row.id, month: apiMonth });
                        }
                      }}
                    >
                      {en.budgets.deleteAction}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
