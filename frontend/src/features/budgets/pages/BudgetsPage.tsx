/**
 * BudgetsPage.tsx
 * Student budgets page (`/app/budgets`): month selector, one editable row per expense category
 * (limit + alert threshold + consumption progress bar), "Copy last month" and a single bulk
 * "Save budgets" action (`PUT /budgets` — there is no per-row PATCH, BR: matches the API shape).
 * `BudgetsForm` is remounted (via `key={month}`) whenever the month changes, so its local edit
 * state is always freshly seeded from that month's server data without an effect-based state sync
 * (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
 * Exports: default (BudgetsPage)
 * Spec: docs/spec/05c §5.11 (budgets & alerts)
 */
import { BUDGET_ALERT_THRESHOLD_DEFAULT, TransactionType, type BudgetDto, type CategoryDto } from '@campuscoin/shared';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { EmptyState } from '../../../components/EmptyState';
import { ErrorState } from '../../../components/ErrorState';
import { MoneyText } from '../../../components/MoneyText';
import { MonthSelector } from '../../../components/MonthSelector';
import { CardSkeleton } from '../../../components/Skeletons';
import { useToast } from '../../../components/ToastProvider';
import { en } from '../../../i18n/en';
import { useAuth } from '../../../lib/auth/AuthContext';
import { currentLocalMonth } from '../../../lib/dates';
import { useCategoriesQuery } from '../../categories/hooks';
import { BudgetRow, type BudgetRowValue } from '../components/BudgetRow';
import { useBudgetsQuery, useCopyPreviousBudgetsMutation, useUpsertBudgetsMutation } from '../hooks';

/** Builds the initial per-category form state map from the categories list + saved budgets. */
function buildInitialValues(categoryIds: number[], budgets: BudgetDto[]): Record<number, BudgetRowValue> {
  const byCategory = new Map(budgets.map((b) => [b.categoryId, b]));
  const values: Record<number, BudgetRowValue> = {};
  for (const categoryId of categoryIds) {
    const existing = byCategory.get(categoryId);
    values[categoryId] = {
      limitAmount: existing?.limitAmount ?? '',
      alertThresholdPct: existing?.alertThresholdPct ?? BUDGET_ALERT_THRESHOLD_DEFAULT,
    };
  }
  return values;
}

interface BudgetsFormProps {
  month: string;
  categories: CategoryDto[];
  initialBudgets: BudgetDto[];
  /** The user's monthly allowance baseline, or `null` if not set (skips the "vs allowance" line). */
  allowance: number | null;
}

/**
 * Owns the editable limit/threshold state for one month's expense categories. Remounted by its
 * parent (`key={month}`) on every month change so it never needs an effect to re-seed state.
 */
function BudgetsForm({ month, categories, initialBudgets, allowance }: BudgetsFormProps) {
  const { showToast } = useToast();
  const upsertMutation = useUpsertBudgetsMutation();
  const copyPreviousMutation = useCopyPreviousBudgetsMutation();

  const categoryIds = useMemo(() => categories.map((c) => c.id), [categories]);
  const [budgets, setBudgets] = useState<BudgetDto[]>(initialBudgets);
  const [values, setValues] = useState<Record<number, BudgetRowValue>>(() => buildInitialValues(categoryIds, initialBudgets));

  const budgetByCategory = useMemo(() => new Map(budgets.map((b) => [b.categoryId, b])), [budgets]);
  const totalBudgeted = useMemo(() => Object.values(values).reduce((sum, v) => sum + (Number(v.limitAmount) || 0), 0), [values]);
  const allowancePct = allowance && allowance > 0 ? Math.round((totalBudgeted / allowance) * 100) : null;

  /** Bulk-saves every row with a non-empty limit via `PUT /budgets`. */
  async function handleSave() {
    const entries = Object.entries(values)
      .filter(([, v]) => v.limitAmount.trim() !== '')
      .map(([categoryId, v]) => ({ categoryId: Number(categoryId), limitAmount: v.limitAmount, alertThresholdPct: v.alertThresholdPct }));
    if (entries.length === 0) return;
    const updated = await upsertMutation.mutateAsync({ month, budgets: entries });
    setBudgets(updated);
    showToast({ message: en.budgets.saved });
  }

  /** Copies last month's budgets into this month, replacing both the saved rows and the form inputs. */
  async function handleCopyPrevious() {
    const updated = await copyPreviousMutation.mutateAsync({ month });
    setBudgets(updated);
    setValues(buildInitialValues(categoryIds, updated));
    showToast({ message: en.budgets.copyPreviousSuccess });
  }

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <div className="text-body-secondary small">{en.budgets.totalBudgeted}</div>
          <div className="h5 mb-0">
            <MoneyText amount={totalBudgeted.toFixed(2)} />
            {allowancePct !== null ? <span className="text-body-secondary small ms-2">{en.budgets.vsAllowance(allowancePct)}</span> : null}
          </div>
        </div>
        <div className="d-flex gap-2">
          <button type="button" className="btn btn-outline-secondary" onClick={() => void handleCopyPrevious()} disabled={copyPreviousMutation.isPending}>
            {en.budgets.copyPrevious}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void handleSave()} disabled={upsertMutation.isPending}>
            {upsertMutation.isPending ? en.budgets.saving : en.budgets.save}
          </button>
        </div>
      </div>

      {categories.map((category) => (
        <BudgetRow
          key={category.id}
          category={category}
          budget={budgetByCategory.get(category.id) ?? null}
          value={values[category.id] ?? { limitAmount: '', alertThresholdPct: BUDGET_ALERT_THRESHOLD_DEFAULT }}
          onChange={(value) => setValues((prev) => ({ ...prev, [category.id]: value }))}
        />
      ))}
    </>
  );
}

/** Student budgets page: set/edit a monthly spending limit per expense category. */
export default function BudgetsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => currentLocalMonth(user?.timezone));

  const categoriesQuery = useCategoriesQuery({ type: TransactionType.EXPENSE });
  const budgetsQuery = useBudgetsQuery({ month });

  const categories = categoriesQuery.data ?? [];
  const isLoading = categoriesQuery.isLoading || budgetsQuery.isLoading;
  const isError = categoriesQuery.isError || budgetsQuery.isError;
  const allowance = user?.monthlyAllowanceBaseline ? Number(user.monthlyAllowanceBaseline) : null;

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
        <div>
          <h1 className="h2 mb-1">{en.budgets.pageTitle}</h1>
          <p className="text-body-secondary mb-0">{en.budgets.subtitle}</p>
        </div>
        <MonthSelector month={month} onChange={setMonth} label={en.budgets.monthLabel} />
      </div>

      {isLoading ? (
        <>
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </>
      ) : isError ? (
        <ErrorState onRetry={() => { void categoriesQuery.refetch(); void budgetsQuery.refetch(); }} />
      ) : categories.length === 0 ? (
        <EmptyState
          icon="bi-wallet2"
          message={en.budgets.empty}
          actionLabel={en.budgets.emptyAction}
          onAction={() => navigate('/app/categories')}
        />
      ) : (
        <BudgetsForm key={month} month={month} categories={categories} initialBudgets={budgetsQuery.data ?? []} allowance={allowance} />
      )}
    </>
  );
}
