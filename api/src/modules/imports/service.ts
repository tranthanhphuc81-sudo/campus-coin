import { createHash } from "node:crypto";
import path from "node:path";

import { CategoryType, Prisma, TransactionType } from "@prisma/client";
import { parse } from "csv-parse/sync";
import { uuidv7 } from "uuidv7";

import { domainEventBus } from "../../events/bus.js";
import { badRequest, conflict, notFound, validationFailed } from "../../lib/problem.js";
import { categorizerService } from "../ai/categorizer.service.js";
import { normalizeMerchantKey } from "../ai/normalize.js";
import {
  commitImportBatch,
  createImportBatchWithRows,
  deleteImportBatch,
  findCategoryByIdForUserAndType,
  getImportBatchForUser,
  listImportCategories,
  listOwnedTransactionsForDuplicateCheck,
  patchImportRows,
  reserveImportCommitIdempotency,
} from "./repository.js";
import type {
  CommitImportResult,
  CsvTemplateResult,
  ImportBatchDto,
  ImportDateFormat,
  ImportPreviewRowDto,
  ImportRowsPatchInput,
} from "./types.js";

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const MAX_ROWS = 5000;
const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;
const ALLOWED_MIME_TYPES = new Set(["text/csv", "text/plain", "application/vnd.ms-excel"]);

type UploadedFile = {
  originalName: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
};

type ParsedAmount = {
  absolute: Prisma.Decimal;
  isNegative: boolean;
};

type CsvPreviewRow = {
  rowNumber: number;
  dateRaw: string | null;
  amountRaw: string | null;
  typeRaw: string | null;
  description: string | null;
  categoryRaw: string | null;
  txnDate: Date | null;
  amount: Prisma.Decimal | null;
  type: TransactionType | null;
  merchantKey: string | null;
  categoryId: number | null;
  categoryName: string | null;
  selected: boolean;
  duplicate: boolean;
  errors: Array<{
    field: "date" | "amount" | "type" | "description" | "category";
    message: string;
  }>;
};

function toIsoDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toWireType(type: TransactionType): "income" | "expense" {
  return type === TransactionType.INCOME ? "income" : "expense";
}

function toCategoryType(type: TransactionType): CategoryType {
  return type === TransactionType.INCOME ? CategoryType.INCOME : CategoryType.EXPENSE;
}

function normalizeCsvText(raw: Buffer): string {
  const text = raw.toString("utf8");
  if (text.includes("\u0000")) {
    throw badRequest("The uploaded file must be a valid UTF-8 CSV file.");
  }

  return text.startsWith("\uFEFF") ? text.slice(1) : text;
}

function detectDelimiter(text: string): "," | ";" {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const sample = lines.slice(0, 5).join("\n");
  const commaCount = (sample.match(/,/g) ?? []).length;
  const semicolonCount = (sample.match(/;/g) ?? []).length;
  return semicolonCount > commaCount ? ";" : ",";
}

function parseDateByFormat(raw: string, dateFormat: ImportDateFormat): Date | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }

  const [a, b, c] = value.split(/[/-]/);
  if (!a || !b || !c) {
    return null;
  }

  let year: number;
  let month: number;
  let day: number;

  if (dateFormat === "YYYY-MM-DD") {
    year = Number(a);
    month = Number(b);
    day = Number(c);
  } else if (dateFormat === "DD/MM/YYYY") {
    day = Number(a);
    month = Number(b);
    year = Number(c);
  } else {
    month = Number(a);
    day = Number(b);
    year = Number(c);
  }

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  if (year < 2000 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function parseAmount(raw: string): ParsedAmount | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const cleaned = trimmed.replace(/\s/g, "").replace(/[^0-9,.-]/g, "");
  if (!cleaned) {
    return null;
  }

  let normalized = cleaned;
  if (cleaned.includes(",") && !cleaned.includes(".")) {
    normalized = cleaned.replace(/,/g, ".");
  } else if (cleaned.includes(",") && cleaned.includes(".")) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      normalized = cleaned.replace(/\./g, "").replace(/,/g, ".");
    } else {
      normalized = cleaned.replace(/,/g, "");
    }
  }

  const amountNumber = Number.parseFloat(normalized);
  if (!Number.isFinite(amountNumber) || amountNumber === 0) {
    return null;
  }

  return {
    absolute: new Prisma.Decimal(Math.abs(amountNumber).toFixed(2)),
    isNegative: amountNumber < 0,
  };
}

function inferType(typeRaw: string | null, isNegative: boolean): TransactionType | null {
  const normalized = typeRaw?.trim().toLowerCase() ?? "";
  if (!normalized) {
    return isNegative ? TransactionType.EXPENSE : TransactionType.EXPENSE;
  }

  if (normalized === "income") {
    return TransactionType.INCOME;
  }

  if (normalized === "expense") {
    return TransactionType.EXPENSE;
  }

  return null;
}

function sanitizeFilename(input: string): string {
  const basename = path.basename(input).trim();
  return basename.slice(0, 255) || "import.csv";
}

function formatPreviewRow(row: {
  id: bigint;
  rowNumber: number;
  txnDate: Date | null;
  amount: Prisma.Decimal | null;
  type: TransactionType | null;
  description: string | null;
  selected: boolean;
  isDuplicate: boolean;
  errors: Prisma.JsonValue;
  category: { id: number; name: string } | null;
}): ImportPreviewRowDto {
  const parsedErrors = Array.isArray(row.errors)
    ? row.errors
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }

          const field = Reflect.get(item, "field");
          const message = Reflect.get(item, "message");
          if (
            (field === "date" ||
              field === "amount" ||
              field === "type" ||
              field === "description" ||
              field === "category") &&
            typeof message === "string"
          ) {
            return { field, message };
          }

          return null;
        })
        .filter(
          (
            item,
          ): item is {
            field: "date" | "amount" | "type" | "description" | "category";
            message: string;
          } => item !== null,
        )
    : [];

  return {
    id: row.id.toString(),
    rowNumber: row.rowNumber,
    date: row.txnDate ? toIsoDateOnly(row.txnDate) : null,
    amount: row.amount ? row.amount.toFixed(2) : null,
    type: row.type ? toWireType(row.type) : null,
    description: row.description,
    categoryId: row.category?.id ?? null,
    categoryName: row.category?.name ?? null,
    selected: row.selected,
    duplicate: row.isDuplicate,
    errors: parsedErrors,
  };
}

function toBatchDto(batch: Awaited<ReturnType<typeof getImportBatchForUser>>): ImportBatchDto {
  if (!batch) {
    throw notFound("Import batch was not found.");
  }

  const now = Date.now();
  if (batch.status !== "COMMITTED" && now - batch.createdAt.getTime() > PREVIEW_TTL_MS) {
    throw conflict("This import preview has expired. Please upload the CSV file again.");
  }

  const preview = batch.rows.map(formatPreviewRow);
  const errors = preview
    .filter((row) => row.errors.length > 0)
    .map((row) => ({
      rowNumber: row.rowNumber,
      messages: row.errors.map((issue) => issue.message),
    }));

  return {
    batchId: batch.id,
    status: batch.status.toLowerCase() as ImportBatchDto["status"],
    totalRows: batch.totalRows,
    validRows: batch.validRows,
    committedRows: batch.committedRows,
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
    preview,
    errors,
  };
}

function csvSafeCell(value: string): string {
  if (!value) {
    return value;
  }

  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }

  return value;
}

function parseCsvRows(text: string, delimiter: "," | ";") {
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    delimiter,
  }) as Array<Record<string, string | undefined>>;
}

function ensureUploadAllowed(file: UploadedFile): void {
  if (file.size > MAX_FILE_SIZE) {
    throw badRequest("CSV file size must be 2 MB or smaller.");
  }

  if (!file.originalName.toLowerCase().endsWith(".csv")) {
    throw badRequest("Only .csv files are supported.");
  }

  if (!ALLOWED_MIME_TYPES.has(file.mimeType)) {
    throw badRequest("Only CSV files are supported.");
  }
}

export function buildCsvTemplate(): CsvTemplateResult {
  const fileName = "campus-coin-import-template.csv";
  const content = [
    "date,amount,type,description,category",
    "2026-09-15,4.50,expense,Campus Cafe latte,Food",
    "2026-09-18,120.00,income,Part-time shift,Part-time Job",
    "2026-09-20,8.25,expense,Bus ride,Transport",
  ].join("\n");

  return { fileName, content };
}

export async function createImportPreview(params: {
  userId: string;
  file: UploadedFile;
  dateFormat: ImportDateFormat;
}): Promise<ImportBatchDto> {
  ensureUploadAllowed(params.file);

  const normalizedText = normalizeCsvText(params.file.buffer);
  const delimiter = detectDelimiter(normalizedText);
  const rows = parseCsvRows(normalizedText, delimiter);

  if (rows.length === 0) {
    throw validationFailed([{ field: "file", message: "The CSV file is empty." }]);
  }

  if (rows.length > MAX_ROWS) {
    throw validationFailed([{ field: "file", message: "CSV file cannot exceed 5000 rows." }]);
  }

  const headers = Object.keys(rows[0] ?? {}).map((header) => header.trim().toLowerCase());
  const requiredHeaders = ["date", "amount", "description"];
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    throw validationFailed([
      {
        field: "file",
        message: `CSV header is missing required columns: ${missingHeaders.join(", ")}.`,
      },
    ]);
  }

  const fileSha256 = createHash("sha256").update(params.file.buffer).digest("hex");

  const availableCategories = await listImportCategories(params.userId);
  const categoriesByTypeAndName = new Map<string, { id: number; name: string }>();
  for (const category of availableCategories) {
    const key = `${category.type}:${category.name.toLowerCase().trim()}`;
    categoriesByTypeAndName.set(key, { id: category.id, name: category.name });
  }

  const previewRows: CsvPreviewRow[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const raw = rows[index] ?? {};
    const rowNumber = index + 2;
    const dateRaw = (raw.date ?? "").trim() || null;
    const amountRaw = (raw.amount ?? "").trim() || null;
    const typeRaw = (raw.type ?? "").trim() || null;
    const description = (raw.description ?? "").trim() || null;
    const categoryRaw = (raw.category ?? "").trim() || null;

    const errors: CsvPreviewRow["errors"] = [];

    const parsedDate = dateRaw ? parseDateByFormat(dateRaw, params.dateFormat) : null;
    if (!parsedDate) {
      errors.push({ field: "date", message: "Invalid date format for selected date pattern." });
    }

    const parsedAmount = amountRaw ? parseAmount(amountRaw) : null;
    if (!parsedAmount) {
      errors.push({ field: "amount", message: "Amount is required and must be a valid decimal." });
    }

    const parsedType = inferType(typeRaw, parsedAmount?.isNegative ?? false);
    if (!parsedType) {
      errors.push({ field: "type", message: "Type must be income or expense when provided." });
    }

    if (!description) {
      errors.push({ field: "description", message: "Description is required." });
    } else if (description.length > 255) {
      errors.push({ field: "description", message: "Description must not exceed 255 characters." });
    }

    let categoryId: number | null = null;
    let categoryName: string | null = null;

    if (parsedType && categoryRaw) {
      const categoryKey = `${parsedType}:${categoryRaw.toLowerCase()}`;
      const matchedCategory = categoriesByTypeAndName.get(categoryKey);
      if (!matchedCategory) {
        errors.push({ field: "category", message: "Category name was not found." });
      } else {
        categoryId = matchedCategory.id;
        categoryName = matchedCategory.name;
      }
    }

    previewRows.push({
      rowNumber,
      dateRaw,
      amountRaw,
      typeRaw,
      description,
      categoryRaw,
      txnDate: parsedDate,
      amount: parsedAmount?.absolute ?? null,
      type: parsedType,
      merchantKey: description ? normalizeMerchantKey(description) : null,
      categoryId,
      categoryName,
      selected: true,
      duplicate: false,
      errors,
    });
  }

  const rowsNeedingCategory = previewRows.filter(
    (row) =>
      row.errors.length === 0 && row.type !== null && row.categoryId === null && row.description,
  );

  for (let offset = 0; offset < rowsNeedingCategory.length; offset += 50) {
    const batch = rowsNeedingCategory.slice(offset, offset + 50);
    await Promise.all(
      batch.map(async (row) => {
        if (!row.description || !row.type || !row.amount) {
          return;
        }

        const suggestion = await categorizerService.suggest({
          userId: params.userId,
          description: row.description,
          amount: row.amount.toFixed(2),
          type: toWireType(row.type),
        });

        if (suggestion) {
          row.categoryId = suggestion.categoryId;
          row.categoryName = suggestion.categoryName;
          return;
        }

        row.errors.push({ field: "category", message: "Category is required for this row." });
      }),
    );
  }

  const validRows = previewRows.filter(
    (row) => row.errors.length === 0 && row.txnDate && row.amount,
  ).length;

  const duplicateCandidates = previewRows.filter(
    (row): row is CsvPreviewRow & { txnDate: Date; amount: Prisma.Decimal; merchantKey: string } =>
      row.errors.length === 0 &&
      row.txnDate !== null &&
      row.amount !== null &&
      row.merchantKey !== null,
  );

  if (duplicateCandidates.length > 0) {
    const sortedByDate = [...duplicateCandidates].sort(
      (a, b) => a.txnDate.getTime() - b.txnDate.getTime(),
    );
    const firstRow = sortedByDate[0];
    const lastRow = sortedByDate[sortedByDate.length - 1];
    if (!firstRow || !lastRow) {
      throw badRequest("Unable to build duplicate detection range.");
    }

    const from = firstRow.txnDate;
    const to = lastRow.txnDate;
    const amounts = Array.from(new Set(sortedByDate.map((row) => row.amount.toFixed(2)))).map(
      (value) => new Prisma.Decimal(value),
    );

    const existing = await listOwnedTransactionsForDuplicateCheck({
      userId: params.userId,
      from,
      to,
      amounts,
    });

    const duplicateSet = new Set(
      existing
        .map((transaction) => {
          const merchantKey = transaction.description
            ? normalizeMerchantKey(transaction.description)
            : null;
          if (!merchantKey) {
            return null;
          }

          return `${toIsoDateOnly(transaction.txnDate)}|${transaction.amount.toFixed(2)}|${merchantKey}`;
        })
        .filter((item): item is string => item !== null),
    );

    for (const row of duplicateCandidates) {
      const key = `${toIsoDateOnly(row.txnDate)}|${row.amount.toFixed(2)}|${row.merchantKey}`;
      if (duplicateSet.has(key)) {
        row.duplicate = true;
        row.selected = false;
      }
    }
  }

  const batchId = uuidv7();
  const rowData = previewRows.map((row) => ({
    rowNumber: row.rowNumber,
    dateRaw: row.dateRaw,
    amountRaw: row.amountRaw,
    typeRaw: row.typeRaw,
    description: row.description,
    categoryRaw: row.categoryRaw,
    txnDate: row.txnDate,
    amount: row.amount,
    type: row.type,
    merchantKey: row.merchantKey,
    categoryId: row.categoryId,
    selected: row.selected,
    isDuplicate: row.duplicate,
    errors: row.errors,
  }));

  const errorReport = previewRows
    .filter((row) => row.errors.length > 0)
    .map((row) => ({ rowNumber: row.rowNumber, errors: row.errors }));

  try {
    await createImportBatchWithRows({
      id: batchId,
      userId: params.userId,
      originalFilename: sanitizeFilename(params.file.originalName),
      fileSha256,
      totalRows: previewRows.length,
      validRows,
      rows: rowData,
      errorReport,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw conflict("This file was already imported before.");
    }

    throw error;
  }

  const batch = await getImportBatchForUser(batchId, params.userId);
  return toBatchDto(batch);
}

export async function getImportBatch(userId: string, batchId: string): Promise<ImportBatchDto> {
  const batch = await getImportBatchForUser(batchId, userId);
  return toBatchDto(batch);
}

export async function updateImportRows(
  userId: string,
  batchId: string,
  payload: ImportRowsPatchInput,
): Promise<ImportBatchDto> {
  const batch = await getImportBatchForUser(batchId, userId);
  if (!batch) {
    throw notFound("Import batch was not found.");
  }

  if (batch.status === "COMMITTED") {
    throw conflict("Committed import batches cannot be changed.");
  }

  const rowsById = new Map(batch.rows.map((row) => [row.id.toString(), row]));
  const updates: Array<{ id: bigint; selected?: boolean; categoryId?: number | null }> = [];

  for (const update of payload.rows) {
    const row = rowsById.get(update.id);
    if (!row) {
      throw validationFailed([{ field: "rows.id", message: `Row ${update.id} does not exist.` }]);
    }

    if (update.categoryId !== undefined && update.categoryId !== null) {
      if (!row.type) {
        throw validationFailed([
          {
            field: "rows.categoryId",
            message: `Row ${update.id} does not have a valid type for category reassignment.`,
          },
        ]);
      }

      const category = await findCategoryByIdForUserAndType({
        userId,
        categoryId: update.categoryId,
        type: toCategoryType(row.type),
      });

      if (!category) {
        throw validationFailed([
          {
            field: "rows.categoryId",
            message: `Category ${update.categoryId} is invalid for row ${update.id}.`,
          },
        ]);
      }
    }

    updates.push({
      id: row.id,
      selected: update.selected,
      categoryId: update.categoryId,
    });
  }

  await patchImportRows({
    batchId,
    userId,
    updates,
  });

  const refreshed = await getImportBatchForUser(batchId, userId);
  return toBatchDto(refreshed);
}

export async function commitImport(
  userId: string,
  batchId: string,
  idempotencyKey: string | null,
): Promise<CommitImportResult> {
  if (!idempotencyKey || idempotencyKey.trim().length === 0) {
    throw badRequest("Idempotency-Key header is required.");
  }

  const trimmedKey = idempotencyKey.trim();
  const keyHash = createHash("sha256")
    .update(`${userId}:imports.commit:${batchId}:${trimmedKey}`)
    .digest("hex");

  try {
    await reserveImportCommitIdempotency({
      userId,
      keyHash,
      expiresAt: new Date(Date.now() + PREVIEW_TTL_MS),
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await getImportBatchForUser(batchId, userId);
      if (!existing) {
        throw notFound("Import batch was not found.");
      }

      if (existing.status === "COMMITTED") {
        return {
          batchId,
          committedRows: existing.committedRows,
          skippedRows: Math.max(0, existing.totalRows - existing.committedRows),
          status: "committed",
        };
      }

      throw conflict("This import commit is already being processed.");
    }

    throw error;
  }

  const now = new Date();
  const committed = await commitImportBatch({
    batchId,
    userId,
    now,
    buildTransactionId: () => uuidv7(),
  });

  if (!committed) {
    throw notFound("Import batch was not found.");
  }

  if (!committed.alreadyCommitted) {
    for (const transaction of committed.createdTransactions) {
      domainEventBus.emit("transaction.created", {
        transactionId: transaction.transactionId,
        userId,
        categoryId: transaction.categoryId,
        type: toWireType(transaction.type),
        amount: transaction.amount.toFixed(2),
        txnDate: toIsoDateOnly(transaction.txnDate),
        source: "csv_import",
        description: transaction.description,
      });
    }
  }

  const refreshed = await getImportBatchForUser(batchId, userId);
  if (!refreshed) {
    throw notFound("Import batch was not found.");
  }

  return {
    batchId,
    committedRows: refreshed.committedRows,
    skippedRows: Math.max(0, refreshed.totalRows - refreshed.committedRows),
    status: "committed",
  };
}

export async function removeImportBatch(userId: string, batchId: string): Promise<void> {
  const batch = await getImportBatchForUser(batchId, userId);
  if (!batch) {
    throw notFound("Import batch was not found.");
  }

  if (batch.status === "COMMITTED") {
    throw conflict("Committed import batches cannot be deleted.");
  }

  await deleteImportBatch({ batchId, userId });
}

export async function buildImportErrorReportCsv(userId: string, batchId: string): Promise<string> {
  const batch = await getImportBatchForUser(batchId, userId);
  if (!batch) {
    throw notFound("Import batch was not found.");
  }

  const header = ["rowNumber", "date", "amount", "type", "description", "category", "errors"];
  const lines = [header.join(",")];

  for (const row of batch.rows) {
    const errors = Array.isArray(row.errors)
      ? row.errors
          .map((item) => {
            const message = typeof item === "object" && item ? Reflect.get(item, "message") : null;
            return typeof message === "string" ? message : null;
          })
          .filter((item): item is string => item !== null)
      : [];

    if (errors.length === 0) {
      continue;
    }

    const values = [
      String(row.rowNumber),
      row.dateRaw ?? "",
      row.amountRaw ?? "",
      row.typeRaw ?? "",
      row.description ?? "",
      row.categoryRaw ?? "",
      errors.join(" | "),
    ].map((value) => csvSafeCell(value).replaceAll('"', '""'));

    lines.push(values.map((value) => `"${value}"`).join(","));
  }

  return lines.join("\n");
}
