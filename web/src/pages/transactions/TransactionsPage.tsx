import {
  aiSuggestionResponseSchema,
  createTransactionInputSchema,
  updateTransactionInputSchema,
  type AiSuggestion,
  type CategoryType,
  type Transaction,
  type TransactionType,
} from "@campus-coin/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useSearchParams } from "react-router-dom";

import { en } from "@/content/en";
import { useCategories } from "@/features/categories/hooks";
import {
  useCreateTransaction,
  useDeleteTransaction,
  useTransactions,
  useUpdateTransaction,
} from "@/features/transactions/hooks";
import LoadingButton from "@/components/common/LoadingButton";
import { formatMoney } from "@/lib/money";
import { parseProblem } from "@/lib/problem";
import api from "@/lib/api";
import { useProfile } from "@/features/profile/hooks";

type TransactionFormValues = {
  categoryId: number;
  amount: string;
  txnDate: string;
  description?: string;
};

function toMonthInput(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function sourceLabel(source: Transaction["source"]): string {
  if (source === "recurring") {
    return en.transactions.sourceLabels.recurring;
  }

  if (source === "csv_import") {
    return en.transactions.sourceLabels.csvImport;
  }

  return en.transactions.sourceLabels.manual;
}

export default function TransactionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeType, setActiveType] = useState<TransactionType>("expense");
  const [month, setMonth] = useState(() => toMonthInput(new Date()));
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [aiSuggestionState, setAiSuggestionState] = useState<{
    description: string;
    type: TransactionType;
    suggestion: AiSuggestion;
  } | null>(null);
  const autoOpenCreateHandled = useRef(false);
  const [manualCategorySelection, setManualCategorySelection] = useState(false);
  const profileQuery = useProfile();

  const expenseCategoriesQuery = useCategories("expense" as CategoryType);
  const incomeCategoriesQuery = useCategories("income" as CategoryType);
  const transactionsQuery = useTransactions({
    month,
    type: activeType,
  });

  const createMutation = useCreateTransaction();
  const updateMutation = useUpdateTransaction();
  const deleteMutation = useDeleteTransaction();

  const expenseCategories = useMemo(
    () => expenseCategoriesQuery.data ?? [],
    [expenseCategoriesQuery.data],
  );
  const incomeCategories = useMemo(
    () => incomeCategoriesQuery.data ?? [],
    [incomeCategoriesQuery.data],
  );
  const categories = useMemo(
    () => (activeType === "expense" ? expenseCategories : incomeCategories),
    [activeType, expenseCategories, incomeCategories],
  );
  const transactions = useMemo(() => transactionsQuery.data ?? [], [transactionsQuery.data]);

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(
      createTransactionInputSchema.omit({
        type: true,
      }),
    ),
    defaultValues: {
      categoryId: 0,
      amount: "",
      txnDate: toDateInput(new Date()),
      description: "",
    },
  });
  const { getValues, setValue } = form;

  const isEditing = Boolean(editingTransaction?.id);
  const descriptionValue = useWatch({ control: form.control, name: "description" }) ?? "";
  const selectedCategoryId = useWatch({ control: form.control, name: "categoryId" });
  const normalizedDescription = descriptionValue.trim();
  const aiSuggestion =
    !isEditing &&
    profileQuery.data?.aiOptIn === true &&
    aiSuggestionState?.description === normalizedDescription &&
    aiSuggestionState.type === activeType
      ? aiSuggestionState.suggestion
      : null;

  useEffect(() => {
    const description = normalizedDescription;
    if (
      !editingTransaction ||
      isEditing ||
      profileQuery.data?.aiOptIn !== true ||
      description.length < 3
    ) {
      return;
    }

    let controller: AbortController | null = null;
    const timeoutId = window.setTimeout(() => {
      controller = new AbortController();
      const enteredAmount = createTransactionInputSchema.shape.amount.safeParse(
        getValues("amount"),
      );
      void api
        .post(
          "/ai/categorize/suggest",
          {
            description,
            amount: enteredAmount.success ? enteredAmount.data : "0.00",
            type: activeType,
          },
          { signal: controller.signal },
        )
        .then((response) => {
          if (controller?.signal.aborted) {
            return;
          }

          const parsed = aiSuggestionResponseSchema.safeParse(response.data);
          const suggestion = parsed.success && "categoryId" in parsed.data ? parsed.data : null;
          if (
            !suggestion ||
            !categories.some((category) => category.id === suggestion.categoryId)
          ) {
            setAiSuggestionState(null);
            return;
          }

          setAiSuggestionState({ description, type: activeType, suggestion });
          if (suggestion.confidence >= 0.6 && !manualCategorySelection) {
            setValue("categoryId", suggestion.categoryId, {
              shouldDirty: true,
              shouldValidate: true,
            });
          }
        })
        .catch(() => {
          // Suggestions are optional; failures must not affect transaction entry.
        });
    }, 400);

    return () => {
      window.clearTimeout(timeoutId);
      controller?.abort();
    };
  }, [
    activeType,
    categories,
    editingTransaction,
    getValues,
    isEditing,
    manualCategorySelection,
    normalizedDescription,
    profileQuery.data?.aiOptIn,
    setValue,
  ]);

  const canOpenCreate = useMemo(() => categories.length > 0, [categories.length]);

  const openCreateDialog = useCallback(() => {
    const firstCategory = categories[0];
    if (!firstCategory) {
      return;
    }

    setManualCategorySelection(false);
    setAiSuggestionState(null);
    setEditingTransaction({
      id: "",
      categoryId: firstCategory.id,
      categoryName: firstCategory.name,
      type: activeType,
      amount: "",
      description: null,
      source: "manual",
      txnDate: toDateInput(new Date()),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    form.reset({
      categoryId: firstCategory.id,
      amount: "",
      txnDate: toDateInput(new Date()),
      description: "",
    });
  }, [activeType, categories, form]);

  useEffect(() => {
    const shouldOpenCreate = searchParams.get("new") === "1";
    if (!shouldOpenCreate) {
      autoOpenCreateHandled.current = false;
      return;
    }

    if (autoOpenCreateHandled.current || !canOpenCreate) {
      return;
    }

    autoOpenCreateHandled.current = true;
    openCreateDialog();

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("new");
    setSearchParams(nextParams, { replace: true });
  }, [canOpenCreate, openCreateDialog, searchParams, setSearchParams]);

  const handleAddClick = () => {
    setFlashMessage(null);

    if (canOpenCreate) {
      openCreateDialog();
      return;
    }

    const fallbackType: TransactionType | null =
      activeType === "expense"
        ? incomeCategories.length > 0
          ? "income"
          : null
        : expenseCategories.length > 0
          ? "expense"
          : null;

    if (fallbackType) {
      setActiveType(fallbackType);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("new", "1");
      setSearchParams(nextParams, { replace: true });
      setFlashMessage(
        en.transactions.messages.switchedTypeToCreate.replace(
          "{type}",
          fallbackType === "expense" ? en.categories.expenseTab : en.categories.incomeTab,
        ),
      );
      return;
    }

    setFlashMessage(en.transactions.messages.missingCategory);
  };

  const openEditDialog = (transaction: Transaction) => {
    setManualCategorySelection(false);
    setAiSuggestionState(null);
    setEditingTransaction(transaction);
    form.reset({
      categoryId: transaction.categoryId,
      amount: transaction.amount,
      txnDate: transaction.txnDate,
      description: transaction.description ?? "",
    });
  };

  const closeDialog = () => {
    setManualCategorySelection(false);
    setAiSuggestionState(null);
    setEditingTransaction(null);
    form.clearErrors();
  };

  const submitForm = form.handleSubmit(async (values) => {
    setFlashMessage(null);

    try {
      if (!editingTransaction) {
        return;
      }

      const normalizedDescription = normalizeOptionalText(values.description);

      if (editingTransaction.id) {
        const payload = updateTransactionInputSchema.parse({
          categoryId: values.categoryId,
          type: activeType,
          amount: values.amount,
          description: normalizedDescription ?? null,
          txnDate: values.txnDate,
        });

        await updateMutation.mutateAsync({
          id: editingTransaction.id,
          data: payload,
        });

        setFlashMessage(en.transactions.messages.updated);
      } else {
        const payload = createTransactionInputSchema.parse({
          categoryId: values.categoryId,
          type: activeType,
          amount: values.amount,
          description: normalizedDescription,
          txnDate: values.txnDate,
          categorySource: aiSuggestion
            ? values.categoryId === aiSuggestion.categoryId
              ? "ai_accepted"
              : "ai_overridden"
            : "user",
          aiSuggestedCategoryId: aiSuggestion?.categoryId ?? null,
          aiConfidence: aiSuggestion?.confidence ?? null,
        });

        await createMutation.mutateAsync(payload);
        setFlashMessage(en.transactions.messages.created);
      }

      closeDialog();
    } catch (error) {
      const problem = parseProblem(error);
      setFlashMessage(problem.detail || en.transactions.messages.saveFailed);
    }
  });

  const aiSuggestionSourceLabel = aiSuggestion
    ? en.transactions.form.aiSources[aiSuggestion.source]
    : "";

  return (
    <section className="transactions-page" aria-labelledby="transactions-page-title">
      <header className="transactions-page__header">
        <div>
          <h1 id="transactions-page-title">{en.transactions.title}</h1>
          <p>{en.transactions.subtitle}</p>
        </div>

        <div className="transactions-page__actions">
          <label htmlFor="transaction-month">{en.transactions.monthLabel}</label>
          <input
            id="transaction-month"
            type="month"
            value={month}
            onChange={(event) => {
              setMonth(event.target.value);
            }}
          />

          <button type="button" className="btn btn-primary" onClick={handleAddClick}>
            {en.transactions.addAction}
          </button>
        </div>
      </header>

      <div className="categories-tabs" role="tablist" aria-label={en.transactions.typeLabel}>
        <button
          type="button"
          role="tab"
          aria-selected={activeType === "expense"}
          className={activeType === "expense" ? "is-active" : ""}
          onClick={() => setActiveType("expense")}
        >
          {en.categories.expenseTab}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeType === "income"}
          className={activeType === "income" ? "is-active" : ""}
          onClick={() => setActiveType("income")}
        >
          {en.categories.incomeTab}
        </button>
      </div>

      {flashMessage ? <p className="flash-success">{flashMessage}</p> : null}

      {transactionsQuery.isLoading ? <p>{en.common.loadingLabel}</p> : null}

      {transactions.length === 0 && !transactionsQuery.isLoading ? (
        <p>{en.transactions.emptyState}</p>
      ) : null}

      {transactions.length > 0 ? (
        <div className="budgets-table-wrapper">
          <table className="budgets-table">
            <thead>
              <tr>
                <th>{en.transactions.table.dateColumn}</th>
                <th>{en.transactions.table.categoryColumn}</th>
                <th>{en.transactions.table.descriptionColumn}</th>
                <th>{en.transactions.table.amountColumn}</th>
                <th>{en.transactions.table.sourceColumn}</th>
                <th>{en.transactions.table.actionsColumn}</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td>{transaction.txnDate}</td>
                  <td>{transaction.categoryName}</td>
                  <td>{transaction.description || "-"}</td>
                  <td>{formatMoney(transaction.amount)}</td>
                  <td>{sourceLabel(transaction.source)}</td>
                  <td>
                    <div className="category-card__actions">
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => openEditDialog(transaction)}
                      >
                        {en.transactions.editAction}
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          void deleteMutation
                            .mutateAsync({ id: transaction.id })
                            .then(() => {
                              setFlashMessage(en.transactions.messages.deleted);
                            })
                            .catch((error: unknown) => {
                              const problem = parseProblem(error);
                              setFlashMessage(
                                problem.detail || en.transactions.messages.deleteFailed,
                              );
                            });
                        }}
                      >
                        {en.transactions.deleteAction}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {editingTransaction ? (
        <div className="dialog-backdrop" role="presentation">
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="transaction-dialog-title"
          >
            <h2 id="transaction-dialog-title">
              {isEditing ? en.transactions.editDialogTitle : en.transactions.createDialogTitle}
            </h2>

            <form className="form-stack" onSubmit={submitForm} noValidate>
              <div className="form-field">
                <label htmlFor="transaction-category">{en.transactions.form.categoryLabel}</label>
                <select
                  id="transaction-category"
                  className="field-select"
                  {...form.register("categoryId", {
                    valueAsNumber: true,
                    onChange: () => {
                      setManualCategorySelection(true);
                    },
                  })}
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                {form.formState.errors.categoryId ? (
                  <p className="form-error" role="alert">
                    {form.formState.errors.categoryId.message}
                  </p>
                ) : null}
                {aiSuggestion &&
                (aiSuggestion.confidence >= 0.6 ||
                  selectedCategoryId === aiSuggestion.categoryId) ? (
                  <span className="badge text-bg-info" title={aiSuggestionSourceLabel}>
                    {en.transactions.form.aiSuggestionLabel}
                  </span>
                ) : null}
                {aiSuggestion &&
                aiSuggestion.confidence < 0.6 &&
                selectedCategoryId !== aiSuggestion.categoryId ? (
                  <button
                    type="button"
                    className="btn btn-outline"
                    title={aiSuggestionSourceLabel}
                    aria-label={en.transactions.suggestion.quickPickAriaLabel.replace(
                      "{category}",
                      aiSuggestion.categoryName,
                    )}
                    onClick={() => {
                      setValue("categoryId", aiSuggestion.categoryId, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }}
                  >
                    {en.transactions.form.aiQuickPickLabel}: {aiSuggestion.categoryName} (
                    {Math.round(aiSuggestion.confidence * 100)}%)
                  </button>
                ) : null}
              </div>

              <div className="form-field">
                <label htmlFor="transaction-amount">{en.transactions.form.amountLabel}</label>
                <input
                  id="transaction-amount"
                  type="text"
                  inputMode="decimal"
                  {...form.register("amount")}
                />
                {form.formState.errors.amount ? (
                  <p className="form-error" role="alert">
                    {form.formState.errors.amount.message}
                  </p>
                ) : null}
              </div>

              <div className="form-field">
                <label htmlFor="transaction-date">{en.transactions.form.dateLabel}</label>
                <input id="transaction-date" type="date" {...form.register("txnDate")} />
                {form.formState.errors.txnDate ? (
                  <p className="form-error" role="alert">
                    {form.formState.errors.txnDate.message}
                  </p>
                ) : null}
              </div>

              <div className="form-field">
                <label htmlFor="transaction-description">
                  {en.transactions.form.descriptionLabel}
                </label>
                <input
                  id="transaction-description"
                  type="text"
                  placeholder={en.transactions.form.descriptionPlaceholder}
                  {...form.register("description")}
                />
              </div>

              <div className="dialog-actions">
                <button type="button" className="btn btn-outline" onClick={closeDialog}>
                  {en.transactions.cancelAction}
                </button>
                <LoadingButton
                  type="submit"
                  isLoading={createMutation.isPending || updateMutation.isPending}
                  loadingLabel={en.common.loadingLabel}
                >
                  {en.transactions.saveAction}
                </LoadingButton>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
