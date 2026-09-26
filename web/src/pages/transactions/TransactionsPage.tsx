import {
  createTransactionInputSchema,
  updateTransactionInputSchema,
  type CategoryType,
  type Transaction,
  type TransactionType,
} from "@campus-coin/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

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
  const [activeType, setActiveType] = useState<TransactionType>("expense");
  const [month, setMonth] = useState(() => toMonthInput(new Date()));
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);

  const categoriesType = activeType as CategoryType;
  const categoriesQuery = useCategories(categoriesType);
  const transactionsQuery = useTransactions({
    month,
    type: activeType,
  });

  const createMutation = useCreateTransaction();
  const updateMutation = useUpdateTransaction();
  const deleteMutation = useDeleteTransaction();

  const categories = categoriesQuery.data ?? [];
  const transactions = transactionsQuery.data ?? [];

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

  const isEditing = Boolean(editingTransaction?.id);

  const canOpenCreate = useMemo(() => categories.length > 0, [categories.length]);

  const openCreateDialog = () => {
    const firstCategory = categories[0];
    if (!firstCategory) {
      return;
    }

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
  };

  const openEditDialog = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    form.reset({
      categoryId: transaction.categoryId,
      amount: transaction.amount,
      txnDate: transaction.txnDate,
      description: transaction.description ?? "",
    });
  };

  const closeDialog = () => {
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

          <button
            type="button"
            className="btn btn-primary"
            disabled={!canOpenCreate}
            onClick={openCreateDialog}
          >
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
                  {...form.register("categoryId", { valueAsNumber: true })}
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
