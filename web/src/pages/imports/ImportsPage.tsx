import { useMemo, useState } from "react";

import { en } from "@/content/en";
import { useCategories } from "@/features/categories/hooks";
import {
  downloadImportErrorReport,
  downloadImportTemplate,
  useCommitImport,
  useGetImportBatch,
  usePatchImportRows,
  useUploadImport,
  type ImportBatch,
} from "@/features/imports/hooks";
import { parseProblem } from "@/lib/problem";

type Step = "upload" | "preview" | "result";
type DateFormat = "YYYY-MM-DD" | "DD/MM/YYYY" | "MM/DD/YYYY";

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `imports-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function ImportsPage() {
  const [step, setStep] = useState<Step>("upload");
  const [dateFormat, setDateFormat] = useState<DateFormat>("YYYY-MM-DD");
  const [file, setFile] = useState<File | null>(null);
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const categoriesExpense = useCategories("expense");
  const categoriesIncome = useCategories("income");

  const uploadMutation = useUploadImport();
  const refreshMutation = useGetImportBatch();
  const patchRowsMutation = usePatchImportRows();
  const commitMutation = useCommitImport();

  const allCategories = useMemo(() => {
    const expense = categoriesExpense.data ?? [];
    const income = categoriesIncome.data ?? [];
    return [...expense, ...income];
  }, [categoriesExpense.data, categoriesIncome.data]);

  const handleUpload = async () => {
    if (!file) {
      setErrorMessage(en.imports.messages.selectFileFirst);
      return;
    }

    setErrorMessage(null);
    setResultMessage(null);

    try {
      const response = await uploadMutation.mutateAsync({ file, dateFormat });
      setBatch(response);
      setStep("preview");
    } catch (error) {
      const problem = parseProblem(error);
      setErrorMessage(problem.detail);
    }
  };

  const handleRefreshBatch = async () => {
    if (!batch) {
      return;
    }

    try {
      const response = await refreshMutation.mutateAsync(batch.batchId);
      setBatch(response);
    } catch (error) {
      const problem = parseProblem(error);
      setErrorMessage(problem.detail);
    }
  };

  const handleToggleSelected = async (rowId: string, selected: boolean) => {
    if (!batch) {
      return;
    }

    try {
      const response = await patchRowsMutation.mutateAsync({
        batchId: batch.batchId,
        rows: [{ id: rowId, selected }],
      });
      setBatch(response);
    } catch (error) {
      const problem = parseProblem(error);
      setErrorMessage(problem.detail);
    }
  };

  const handleChangeCategory = async (rowId: string, categoryId: number | null) => {
    if (!batch) {
      return;
    }

    try {
      const response = await patchRowsMutation.mutateAsync({
        batchId: batch.batchId,
        rows: [{ id: rowId, categoryId }],
      });
      setBatch(response);
    } catch (error) {
      const problem = parseProblem(error);
      setErrorMessage(problem.detail);
    }
  };

  const handleCommit = async () => {
    if (!batch) {
      return;
    }

    try {
      const result = await commitMutation.mutateAsync({
        batchId: batch.batchId,
        idempotencyKey: generateIdempotencyKey(),
      });

      setResultMessage(
        en.imports.messages.commitSuccess
          .replace("{committed}", String(result.committedRows))
          .replace("{skipped}", String(result.skippedRows)),
      );
      setStep("result");
      await handleRefreshBatch();
    } catch (error) {
      const problem = parseProblem(error);
      setErrorMessage(problem.detail);
    }
  };

  return (
    <section className="page imports-page">
      <header className="mb-4">
        <h1 className="h2 mb-1">{en.imports.title}</h1>
        <p className="text-muted mb-0">{en.imports.subtitle}</p>
      </header>

      {errorMessage ? (
        <div className="alert alert-danger" role="alert">
          {errorMessage}
        </div>
      ) : null}

      {resultMessage ? (
        <div className="alert alert-success" role="alert">
          {resultMessage}
        </div>
      ) : null}

      <div className="card mb-4">
        <div className="card-body">
          <div className="d-flex flex-wrap gap-3 align-items-center">
            <span className={`badge ${step === "upload" ? "text-bg-primary" : "text-bg-light"}`}>
              1. {en.imports.steps.upload}
            </span>
            <span className={`badge ${step === "preview" ? "text-bg-primary" : "text-bg-light"}`}>
              2. {en.imports.steps.preview}
            </span>
            <span className={`badge ${step === "result" ? "text-bg-primary" : "text-bg-light"}`}>
              3. {en.imports.steps.result}
            </span>
          </div>
        </div>
      </div>

      {step === "upload" ? (
        <div className="card">
          <div className="card-body">
            <div className="mb-3">
              <label htmlFor="date-format" className="form-label">
                {en.imports.dateFormatLabel}
              </label>
              <select
                id="date-format"
                className="form-select"
                value={dateFormat}
                onChange={(event) => setDateFormat(event.target.value as DateFormat)}
              >
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              </select>
            </div>

            <div className="mb-3">
              <label htmlFor="import-file" className="form-label">
                {en.imports.fileLabel}
              </label>
              <input
                id="import-file"
                type="file"
                accept=".csv,text/csv"
                className="form-control"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </div>

            <div className="d-flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => {
                  void downloadImportTemplate();
                }}
              >
                {en.imports.downloadTemplateAction}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  void handleUpload();
                }}
                disabled={uploadMutation.isPending}
              >
                {uploadMutation.isPending ? en.imports.uploadingAction : en.imports.uploadAction}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {step === "preview" && batch ? (
        <div className="card">
          <div className="card-body">
            <div className="d-flex flex-wrap gap-3 mb-3">
              <span className="badge text-bg-light">
                {en.imports.summary.total.replace("{count}", String(batch.totalRows))}
              </span>
              <span className="badge text-bg-success">
                {en.imports.summary.valid.replace("{count}", String(batch.validRows))}
              </span>
              <span className="badge text-bg-danger">
                {en.imports.summary.errors.replace("{count}", String(batch.errors.length))}
              </span>
            </div>

            <div className="table-responsive">
              <table className="table table-sm align-middle">
                <thead>
                  <tr>
                    <th>{en.imports.table.selectColumn}</th>
                    <th>{en.imports.table.rowColumn}</th>
                    <th>{en.imports.table.dateColumn}</th>
                    <th>{en.imports.table.amountColumn}</th>
                    <th>{en.imports.table.typeColumn}</th>
                    <th>{en.imports.table.descriptionColumn}</th>
                    <th>{en.imports.table.categoryColumn}</th>
                    <th>{en.imports.table.statusColumn}</th>
                  </tr>
                </thead>
                <tbody>
                  {batch.preview.map((row) => {
                    const hasErrors = row.errors.length > 0;
                    const rowClassName = hasErrors
                      ? "table-danger"
                      : row.duplicate
                        ? "table-warning"
                        : undefined;

                    return (
                      <tr key={row.id} className={rowClassName}>
                        <td>
                          <input
                            type="checkbox"
                            className="form-check-input"
                            checked={row.selected}
                            disabled={hasErrors}
                            onChange={(event) => {
                              void handleToggleSelected(row.id, event.target.checked);
                            }}
                          />
                        </td>
                        <td>{row.rowNumber}</td>
                        <td>{row.date ?? "-"}</td>
                        <td>{row.amount ?? "-"}</td>
                        <td>{row.type ?? "-"}</td>
                        <td>{row.description ?? "-"}</td>
                        <td>
                          <select
                            className="form-select form-select-sm"
                            value={row.categoryId ?? ""}
                            onChange={(event) => {
                              const value = event.target.value;
                              void handleChangeCategory(row.id, value ? Number(value) : null);
                            }}
                          >
                            <option value="">{en.imports.categoryPlaceholder}</option>
                            {allCategories
                              .filter((category) =>
                                row.type ? category.type.toLowerCase() === row.type : true,
                              )
                              .map((category) => (
                                <option key={category.id} value={category.id}>
                                  {category.name}
                                </option>
                              ))}
                          </select>
                        </td>
                        <td>
                          {hasErrors
                            ? row.errors.map((issue) => issue.message).join("; ")
                            : row.duplicate
                              ? en.imports.status.duplicate
                              : en.imports.status.ok}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="d-flex flex-wrap gap-2 mt-3">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => {
                  void downloadImportErrorReport(batch.batchId);
                }}
              >
                {en.imports.downloadErrorReportAction}
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => {
                  setStep("upload");
                }}
              >
                {en.imports.backToUploadAction}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  void handleCommit();
                }}
                disabled={commitMutation.isPending}
              >
                {commitMutation.isPending ? en.imports.committingAction : en.imports.commitAction}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {step === "result" && batch ? (
        <div className="card">
          <div className="card-body">
            <p className="mb-3">{en.imports.resultDetail}</p>
            <div className="d-flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => {
                  void downloadImportErrorReport(batch.batchId);
                }}
              >
                {en.imports.downloadErrorReportAction}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setStep("upload");
                  setBatch(null);
                  setFile(null);
                  setResultMessage(null);
                }}
              >
                {en.imports.newImportAction}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
