/**
 * imports.service.ts
 * Orchestrates the CSV import wizard: upload -> parse (background job) -> preview -> edit ->
 * commit. Business logic only; HTTP glue lives in `imports.controller.ts`. No transaction row is
 * ever written before `commit()` (docs/spec/05a §5.5).
 * Main exports: upload, parseBatch, get, updateRows, discard, commit, buildErrorsCsv, templateCsv
 * Spec: docs/spec/05a §5.5 · docs/spec/09 §9.10 · docs/spec/07 §7.3.2
 */
import { createHash } from 'node:crypto';
import {
  API_BASE_PATH,
  CategorySource,
  IMPORT_COMMIT_TX_TIMEOUT_MS,
  IMPORT_CSV_COLUMNS,
  IMPORT_FALLBACK_CATEGORY_NAME,
  IMPORT_OPEN_BATCHES_MAX,
  IMPORT_PREVIEW_TTL_SEC,
  ImportBatchStatus,
  ImportCategoryOrigin,
  ImportRowFilter,
  TransactionType,
  type CategoryDto,
  type CategorySuggestionDto,
  type ImportBatchDto,
  type ImportBatchQueryInput,
  type ImportCommitResultDto,
  type ImportUploadResultDto,
  type UpdateImportRowsInput,
} from '@campuscoin/shared';
import { emitAfterCommit } from '../../events/bus.js';
import type { FieldError } from '../../lib/problem.js';
import { fromDbDate, firstDayOfMonth } from '../../lib/dates.js';
import { logger } from '../../lib/logger.js';
import { normalizeMerchantKey } from '../../lib/merchantKey.js';
import { buildPaginationMeta, parsePagination } from '../../lib/pagination.js';
import { conflict, notFound, serviceUnavailable, validationFailed } from '../../lib/problem.js';
import { prisma } from '../../lib/prisma.js';
import { sanitizeFilename } from '../../lib/strings.js';
import { toCsv } from '../../lib/csvSafe.js';
import { Prisma } from '../../generated/prisma/client.js';
import * as aiService from '../ai/ai.service.js';
import * as categoriesService from '../categories/categories.service.js';
import { insertImportedTransactions, type ImportRowInsertInput } from '../transactions/transactions.core.js';
import * as transactionsService from '../transactions/transactions.service.js';
import { record as recordAudit } from '../audit/audit.service.js';
import { usersRepository } from '../users/users.repository.js';
import { enqueueImportParse } from './imports.jobs.js';
import { toImportBatchDto } from './imports.mapper.js';
import { detectDelimiter, guessMapping, parseCsvRecords } from './imports.parser.js';
import { buildRow, detectDateFormat, looksNegativeAmountCell } from './imports.normalize.js';
import { assertCsvFile, decodeCsvText } from './imports.upload.js';
import { importsRepository } from './imports.repository.js';
import { deletePreviewKeys, loadPreview, loadRaw, savePreview, saveRaw, withPreviewLock } from './imports.store.js';
import type { ImportBatchModel } from '../../generated/prisma/models/ImportBatch.js';
import type { ImportErrorReport, ImportParseJobData, StoredOverride, StoredPreview, StoredRow, StoredRowDraft } from './imports.types.js';

const IMPORT_TEMPLATE_ROWS: readonly (readonly string[])[] = [
  ['2026-09-15', '4.50', 'expense', 'Campus Cafe latte', 'Food'],
  ['2026-09-16', '12.00', 'expense', 'Bus pass top-up', 'Transport'],
  ['2026-09-01', '300.00', 'income', 'Monthly allowance', 'Allowance'],
];

/** `GET /imports/template` — downloadable sample CSV (docs/spec/05a Table 19). */
export function templateCsv(): string {
  return toCsv([...IMPORT_CSV_COLUMNS], IMPORT_TEMPLATE_ROWS);
}

/** Unix epoch seconds the preview/raw text expires at, pinned to the batch's own `createdAt`. */
function expiryFor(batch: Pick<ImportBatchModel, 'createdAt'>): number {
  return Math.floor(batch.createdAt.getTime() / 1000) + IMPORT_PREVIEW_TTL_SEC;
}

/**
 * `POST /imports`: validates the upload, hashes it (dedupe/re-upload detection), creates the batch
 * row, stashes the raw text in Redis, and enqueues the background parse — no CSV parsing happens
 * on the request thread.
 * @throws {AppError} 415/422 on an invalid file (see `imports.upload.ts`); 409 when this exact
 *   file was already imported/is mid-import, or the caller already has {@link IMPORT_OPEN_BATCHES_MAX}
 *   open batches (B-M3: anti-abuse cap on Redis preview storage); 503 if Redis is unavailable to
 *   store the raw text.
 */
export async function upload(userId: string, file: Express.Multer.File): Promise<ImportUploadResultDto> {
  assertCsvFile(file);
  const text = decodeCsvText(file.buffer);
  const fileSha256 = createHash('sha256').update(text, 'utf8').digest('hex');

  const existing = await importsRepository.findByHash(userId, fileSha256);
  if (existing) {
    if (existing.status === ImportBatchStatus.FAILED || existing.status === ImportBatchStatus.EXPIRED) {
      await importsRepository.deleteOwned(existing.id, userId);
    } else {
      throw conflict('This file has already been imported.');
    }
  }

  // B-M3: caps how many open (uncommitted/undiscarded) batches one user can accumulate — each
  // holds raw text + a preview in Redis for up to 24h, shared with sessions/rate-limits/BullMQ.
  const openCount = await importsRepository.countOpen(userId);
  if (openCount >= IMPORT_OPEN_BATCHES_MAX) {
    throw conflict(`You already have ${IMPORT_OPEN_BATCHES_MAX} imports in progress. Finish or discard one before uploading another.`);
  }

  let batch: ImportBatchModel;
  try {
    batch = await importsRepository.create({ userId, originalFilename: sanitizeFilename(file.originalname), fileSha256 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw conflict('This file has already been imported.');
    }
    throw err;
  }

  try {
    await saveRaw(batch.id, text, expiryFor(batch));
  } catch (err) {
    await importsRepository.deleteOwned(batch.id, userId).catch(() => undefined);
    logger.warn({ err, batchId: batch.id }, '[imports] failed to stash raw upload in Redis');
    throw serviceUnavailable('Could not process the upload right now. Try again shortly.');
  }

  await enqueueImportParse({ batchId: batch.id, userId, rev: 0 });
  return { batchId: batch.id, status: batch.status };
}

/** Case/whitespace/NFC-insensitive category-name comparison (matches a CSV `category` cell to the user's own categories). */
function normalizeCategoryName(name: string): string {
  return name.normalize('NFC').trim().toLowerCase();
}

/** Applies the fallback category (Miscellaneous/Other Income) to a row that could not otherwise be classified. */
function applyFallbackCategory(row: StoredRow, categoriesByType: Record<TransactionType, CategoryDto[]>): void {
  const type = row.type;
  if (!type) return;
  const categories = categoriesByType[type];
  const fallbackName = IMPORT_FALLBACK_CATEGORY_NAME[type];
  const fallback = categories.find((c) => c.name === fallbackName) ?? categories[0];
  row.needsReview = true;
  if (!fallback) return; // no usable category of this type at all -> resolveRows turns this into a row error.
  row.categoryId = fallback.id;
  row.categoryName = fallback.name;
  row.categoryOrigin = ImportCategoryOrigin.FALLBACK;
}

/**
 * Resolves category/AI/duplicate state for every draft row: matches the CSV's own `category`
 * column by name first, then batches everything else through P10's `aiService.suggestBatch`
 * (never throws — AI must never block saving), falls back to Miscellaneous/Other Income, and
 * finally flags duplicates against both the user's existing transactions and earlier rows in the
 * same file.
 */
async function resolveRows(userId: string, drafts: StoredRowDraft[]): Promise<StoredRow[]> {
  const [incomeCategories, expenseCategories] = await Promise.all([
    categoriesService.list(userId, { type: TransactionType.INCOME, includeInactive: false }),
    categoriesService.list(userId, { type: TransactionType.EXPENSE, includeInactive: false }),
  ]);
  const categoriesByType: Record<TransactionType, CategoryDto[]> = { income: incomeCategories, expense: expenseCategories };
  const byNameByType: Record<TransactionType, Map<string, CategoryDto>> = {
    income: new Map(incomeCategories.map((c) => [normalizeCategoryName(c.name), c])),
    expense: new Map(expenseCategories.map((c) => [normalizeCategoryName(c.name), c])),
  };

  const rows: StoredRow[] = drafts.map((draft) => ({
    ...draft,
    categoryId: null,
    categoryName: null,
    categoryOrigin: null,
    aiSuggestedCategoryId: null,
    aiConfidence: null,
    aiTier: null,
    isDuplicate: false,
    needsReview: false,
    selected: draft.errors.length === 0,
  }));

  const needsAi: number[] = [];
  rows.forEach((row, index) => {
    if (row.errors.length > 0 || row.type === null) return;
    const rawName = row.raw.category?.trim();
    if (!rawName) {
      needsAi.push(index);
      return;
    }
    const match = byNameByType[row.type].get(normalizeCategoryName(rawName));
    if (match) {
      row.categoryId = match.id;
      row.categoryName = match.name;
      row.categoryOrigin = ImportCategoryOrigin.CSV;
    } else {
      // Decision: a non-blank but unmatched category name still tries AI, but is ALWAYS flagged
      // needsReview so the user notices the original name in the file was ignored.
      row.needsReview = true;
      needsAi.push(index);
    }
  });

  if (needsAi.length > 0) {
    let suggestions: (CategorySuggestionDto | null)[];
    try {
      // `rows[i]!` is safe: every index in `needsAi` came from `rows.forEach` above.
      suggestions = await aiService.suggestBatch(userId, needsAi.map((i) => ({ description: rows[i]!.description ?? '', type: rows[i]!.type! })));
    } catch (err) {
      logger.warn({ err, userId }, '[imports] suggestBatch failed, falling back for every row (AI must never block saving)');
      suggestions = needsAi.map(() => null);
    }

    needsAi.forEach((index, i) => {
      const row = rows[index]!;
      const suggestion = suggestions[i];
      if (suggestion) {
        row.categoryId = suggestion.categoryId;
        row.categoryName = suggestion.categoryName;
        row.categoryOrigin = ImportCategoryOrigin.AI;
        row.aiSuggestedCategoryId = suggestion.categoryId;
        row.aiConfidence = suggestion.confidence;
        row.aiTier = suggestion.tier;
      } else {
        applyFallbackCategory(row, categoriesByType);
      }
    });
  }

  for (const row of rows) {
    if (row.errors.length === 0 && row.categoryId === null) {
      row.errors.push({ field: 'category', message: 'Could not determine a category for this row.' });
      row.selected = false;
    }
  }

  await markDuplicates(userId, rows);
  return rows;
}

/** Flags a row a duplicate (and deselects it) when it matches an existing transaction or an earlier row in the same file. */
async function markDuplicates(userId: string, rows: StoredRow[]): Promise<void> {
  const candidates = rows.filter((r) => r.errors.length === 0 && r.txnDate !== null && r.amount !== null);
  if (candidates.length === 0) return;

  const existingKeys = await transactionsService.findDuplicateKeys(
    userId,
    candidates.map((r) => ({ txnDate: r.txnDate!, amount: r.amount!, description: r.description })),
  );

  const seenInFile = new Set<string>();
  for (const row of candidates) {
    const key = `${row.txnDate}|${row.amount}|${(row.description ?? '').trim().toLowerCase()}`;
    if (existingKeys.has(key) || seenInFile.has(key)) {
      row.isDuplicate = true;
      row.selected = false;
    }
    seenInFile.add(key);
  }
}

/** Applies a stored row-level edit (from `PATCH /imports/:id/rows`) on top of a freshly-resolved row. Never mutates `row`. */
function applyOverrideToRow(row: StoredRow, override: StoredOverride | undefined): StoredRow {
  if (!override) return row;
  return {
    ...row,
    ...(override.categoryId !== undefined
      ? { categoryId: override.categoryId, categoryName: override.categoryName ?? row.categoryName, categoryOrigin: ImportCategoryOrigin.USER, needsReview: false }
      : {}),
    ...(override.selected !== undefined && row.errors.length === 0 ? { selected: override.selected } : {}),
  };
}

/**
 * Background job body for the `import.parse` queue (`imports.jobs.ts`/`jobs/processors/import-parse.processor.ts`).
 * Idempotent against stale/duplicate runs: a batch that no longer exists, isn't in an expected
 * status, or whose stored preview has already moved past this job's `rev` is a silent no-op
 * (never throws — BullMQ would otherwise retry a run that can no longer do anything useful).
 */
export async function parseBatch(data: ImportParseJobData): Promise<void> {
  const { batchId, userId, rev } = data;
  const batch = await importsRepository.findOwned(batchId, userId);
  if (!batch) return; // discarded before this job ran.

  const claimed = await importsRepository.setStatus(batchId, userId, [ImportBatchStatus.UPLOADED, ImportBatchStatus.PARSING], {
    status: ImportBatchStatus.PARSING,
  });
  if (claimed === 0) return; // already committed/discarded/re-claimed by a newer job.

  try {
    const [text, existingPreview, user] = await Promise.all([loadRaw(batchId), loadPreview(batchId), usersRepository.findById(userId)]);
    if (existingPreview && existingPreview.rev > rev) return; // superseded by a newer PATCH before this job ran.
    if (!text || !user) {
      await importsRepository.setStatus(batchId, userId, [ImportBatchStatus.PARSING], { status: ImportBatchStatus.EXPIRED });
      return;
    }

    const delimiter = existingPreview?.options.delimiter ?? detectDelimiter(text);
    const parsed = await parseCsvRecords(text, delimiter);

    if (parsed.fatal) {
      const report: ImportErrorReport = { fatal: parsed.fatal };
      await importsRepository.setStatus(batchId, userId, [ImportBatchStatus.PARSING], { status: ImportBatchStatus.FAILED, errorReport: report });
      return;
    }

    const mapping = existingPreview?.options.mapping ?? guessMapping(parsed.headers);
    const hasTypeColumn = mapping.type !== null;
    const amountIndex = mapping.amount ?? -1;
    const inferSign = !hasTypeColumn && parsed.records.some((r) => looksNegativeAmountCell(r.cells[amountIndex] ?? null));
    const dateIndex = mapping.date ?? -1;
    const dateFormat = existingPreview?.options.dateFormat ?? detectDateFormat(parsed.records.map((r) => r.cells[dateIndex] ?? '').filter(Boolean));

    const drafts = parsed.records.map((r) =>
      buildRow(r.rowNumber, r.cells, mapping, { dateFormat, currency: user.currency, timezone: user.timezone, hasTypeColumn, inferSign }),
    );
    const rows = await resolveRows(userId, drafts);
    const overrides = existingPreview?.overrides ?? {};

    const preview: StoredPreview = { userId, rev, options: { delimiter, dateFormat, mapping }, headers: parsed.headers, failure: null, rows, overrides };
    await savePreview(batchId, preview, expiryFor(batch));

    const validRows = rows.filter((r) => r.errors.length === 0).length;
    const errorReport: ImportErrorReport = {
      errorRows: rows
        .filter((r) => r.errors.length > 0)
        .map((r) => ({
          rowNumber: r.rowNumber,
          date: r.raw.date,
          amount: r.raw.amount,
          type: r.raw.type,
          description: r.raw.description,
          category: r.raw.category,
          errors: r.errors.map((e) => `${e.field}: ${e.message}`),
        })),
    };

    await importsRepository.setStatus(batchId, userId, [ImportBatchStatus.PARSING], {
      status: ImportBatchStatus.PREVIEWED,
      totalRows: rows.length,
      validRows,
      errorReport,
    });
  } catch (err) {
    // Never log raw cell contents on this path (PII) — only the error and batch id.
    logger.error({ err, batchId }, '[imports] parse failed');
    const report: ImportErrorReport = { fatal: { code: 'internal', message: 'Could not process this file.' } };
    await importsRepository.setStatus(batchId, userId, [ImportBatchStatus.PARSING], { status: ImportBatchStatus.FAILED, errorReport: report }).catch(() => undefined);
  }
}

function filterRows(rows: StoredRow[], filter: ImportRowFilter): StoredRow[] {
  switch (filter) {
    case ImportRowFilter.ERRORS:
      return rows.filter((r) => r.errors.length > 0);
    case ImportRowFilter.DUPLICATES:
      return rows.filter((r) => r.isDuplicate);
    case ImportRowFilter.NEEDS_REVIEW:
      return rows.filter((r) => r.needsReview);
    default:
      return rows;
  }
}

/**
 * `GET /imports/:id` — status + paginated/filterable preview. A `previewed` batch whose Redis
 * preview has expired is lazily marked `expired` here — an `uploaded`/`parsing` batch has no
 * preview yet by design (it hasn't been parsed, or is being re-parsed), so a missing preview in
 * either of those statuses is normal, not a sign of expiry.
 * @throws {AppError} 404 when not found or not owned by `userId`.
 */
export async function get(userId: string, id: string, query: ImportBatchQueryInput): Promise<ImportBatchDto> {
  let batch = await importsRepository.findOwned(id, userId);
  if (!batch) throw notFound('Import batch not found.');

  let preview: StoredPreview | null = null;
  if (batch.status === ImportBatchStatus.PREVIEWED) {
    preview = await loadPreview(id);
    if (!preview) {
      await importsRepository.setStatus(id, userId, [batch.status], { status: ImportBatchStatus.EXPIRED });
      batch = { ...batch, status: ImportBatchStatus.EXPIRED };
    }
  } else if (batch.status === ImportBatchStatus.PARSING) {
    preview = await loadPreview(id); // may already hold the previous preview while a re-parse runs.
  }

  const effectiveRows = preview ? preview.rows.map((row) => applyOverrideToRow(row, preview!.overrides[row.rowNumber])) : null;
  const { page, limit, skip, take } = parsePagination(query);
  const filtered = effectiveRows ? filterRows(effectiveRows, query.filter) : [];
  const meta = buildPaginationMeta(page, limit, filtered.length);
  const pageSlice = filtered.slice(skip, skip + take);

  return toImportBatchDto(batch, preview, effectiveRows, preview ? { data: pageSlice, meta } : null);
}

/**
 * `PATCH /imports/:id/rows` — edits the column mapping/date format (triggers a re-parse, 202) or a
 * row's category/selection (applies immediately, 200). Row edits are stored as `overrides` and
 * re-applied by `rowNumber` after every (re-)parse, never by mutating the stored preview rows.
 * @throws {AppError} 404 not found; 409 when the batch isn't `previewed` or its preview expired;
 *   422 on an unknown row, an unusable category, or selecting a row that still has errors.
 */
export async function updateRows(userId: string, id: string, input: UpdateImportRowsInput): Promise<{ status: string }> {
  return withPreviewLock(id, async () => {
    const batch = await importsRepository.findOwned(id, userId);
    if (!batch) throw notFound('Import batch not found.');
    if (batch.status !== ImportBatchStatus.PREVIEWED) throw conflict('This import is not ready to edit.');

    const preview = await loadPreview(id);
    if (!preview) {
      await importsRepository.setStatus(id, userId, [batch.status], { status: ImportBatchStatus.EXPIRED });
      throw conflict('Preview expired, upload again.');
    }

    if (input.options) {
      const mapping = input.options.mapping ?? preview.options.mapping;
      const indexes = [mapping.date, mapping.amount, mapping.type, mapping.description, mapping.category].filter((i): i is number => i !== null);
      if (indexes.some((i) => i >= preview.headers.length)) {
        throw validationFailed([{ field: 'options.mapping', message: 'A mapped column is out of range for this file.' }]);
      }
      if (new Set(indexes).size !== indexes.length) {
        throw validationFailed([{ field: 'options.mapping', message: 'Two fields cannot map to the same column.' }]);
      }

      const nextRev = preview.rev + 1;
      const nextOptions = {
        ...preview.options,
        ...(input.options.dateFormat ? { dateFormat: input.options.dateFormat } : {}),
        ...(input.options.mapping ? { mapping: input.options.mapping } : {}),
      };
      await savePreview(id, { ...preview, rev: nextRev, options: nextOptions }, expiryFor(batch));
      await importsRepository.setStatus(id, userId, [ImportBatchStatus.PREVIEWED], { status: ImportBatchStatus.PARSING });
      await enqueueImportParse({ batchId: id, userId, rev: nextRev });
      return { status: ImportBatchStatus.PARSING };
    }

    const byRowNumber = new Map(preview.rows.map((r) => [r.rowNumber, r]));
    const overrides: Record<number, StoredOverride> = { ...preview.overrides };

    if (input.rows) {
      // B-L5 perf fix: one batched category lookup for every row edit in this call, instead of up
      // to IMPORT_ROWS_PATCH_MAX sequential single-id queries — keeps this comfortably under
      // withPreviewLock's TTL under load.
      const categoryIds = input.rows.filter((edit) => edit.categoryId !== undefined).map((edit) => edit.categoryId!);
      const usableCategories = await categoriesService.findUsableCategoriesBatch(userId, categoryIds, { requireActive: true });

      for (const edit of input.rows) {
        const row = byRowNumber.get(edit.rowNumber);
        if (!row) throw validationFailed([{ field: 'rows', message: `Row ${edit.rowNumber} not found.` }]);

        const next: StoredOverride = { ...overrides[edit.rowNumber] };

        if (edit.categoryId !== undefined) {
          if (!row.type) throw validationFailed([{ field: 'rows', message: `Row ${edit.rowNumber} has no valid type.` }]);
          const category = usableCategories.get(edit.categoryId);
          if (!category || category.type !== row.type) {
            throw validationFailed([{ field: 'rows', message: `Row ${edit.rowNumber}: category not found.` }]);
          }
          next.categoryId = category.id;
          next.categoryName = category.name;
        }

        if (edit.selected !== undefined) {
          if (edit.selected && row.errors.length > 0) {
            throw validationFailed([{ field: 'rows', message: `Row ${edit.rowNumber} has errors and cannot be selected.` }]);
          }
          next.selected = edit.selected;
        }

        overrides[edit.rowNumber] = next;
      }
    }

    if (input.setAllSelected !== undefined) {
      for (const row of preview.rows) {
        if (row.errors.length > 0) continue;
        overrides[row.rowNumber] = { ...overrides[row.rowNumber], selected: input.setAllSelected };
      }
    }

    await savePreview(id, { ...preview, overrides }, expiryFor(batch));
    return { status: batch.status };
  });
}

/**
 * `DELETE /imports/:id` — discards a not-yet-committed batch.
 * @throws {AppError} 404 not found; 409 when the batch has already been committed.
 */
export async function discard(userId: string, id: string): Promise<void> {
  const batch = await importsRepository.findOwned(id, userId);
  if (!batch) throw notFound('Import batch not found.');
  if (batch.status === ImportBatchStatus.COMMITTED) throw conflict('This import has already been committed.');
  await deletePreviewKeys(id);
  await importsRepository.deleteOwned(id, userId);
}

/**
 * `POST /imports/:id/commit` — writes every selected, error-free row inside ONE DB transaction,
 * then emits exactly one aggregated `transactions.imported` event (never one per row).
 * `POST /:id/commit`'s route mounts the `idempotency` middleware; the status guard inside the
 * transaction (step 1 below) is the second, DB-level line of defense against a duplicate commit.
 * @throws {AppError} 404 not found; 409 already committed / not ready to commit / preview expired
 *   / a concurrent commit won the race; 422 when nothing is selected or re-validation fails
 *   (nothing is written in that case).
 */
export async function commit(userId: string, id: string, ctx: { ip?: string; userAgent?: string }): Promise<ImportCommitResultDto> {
  const batch = await importsRepository.findOwned(id, userId);
  if (!batch) throw notFound('Import batch not found.');
  if (batch.status === ImportBatchStatus.COMMITTED) throw conflict('This import has already been committed.');
  if (batch.status !== ImportBatchStatus.PREVIEWED) throw conflict('This import is not ready to commit.');

  const preview = await loadPreview(id);
  if (!preview) {
    await importsRepository.setStatus(id, userId, [batch.status], { status: ImportBatchStatus.EXPIRED });
    throw conflict('Preview expired, upload again.');
  }

  const effectiveRows = preview.rows.map((row) => applyOverrideToRow(row, preview.overrides[row.rowNumber]));
  const selectedRows = effectiveRows.filter((row) => row.selected && row.errors.length === 0);
  if (selectedRows.length === 0) throw validationFailed([{ field: 'rows', message: 'No rows selected.' }]);

  const user = await usersRepository.findById(userId);
  if (!user) throw notFound('Import batch not found.');

  // Re-validate right before writing: a category may have been archived/deleted since the preview
  // was built, and business rules are re-checked against the CURRENT user record. Any failure here
  // aborts the whole commit — nothing is written (docs/spec/05a §5.5).
  const usableCategoryCache = new Map<string, boolean>();
  const revalidationErrors: FieldError[] = [];
  for (const row of selectedRows) {
    const cacheKey = `${row.categoryId}:${row.type}`;
    let usable = usableCategoryCache.get(cacheKey);
    if (usable === undefined) {
      const found = await categoriesService.findUsableCategory(userId, row.categoryId!, row.type!, { requireActive: true });
      usable = found !== null;
      usableCategoryCache.set(cacheKey, usable);
    }
    if (!usable) {
      revalidationErrors.push({ field: 'rows', message: `Row ${row.rowNumber}: category is no longer usable.` });
      continue;
    }
    for (const ruleError of transactionsService.collectBusinessRuleErrors({ timezone: user.timezone, currency: user.currency }, row.amount!, row.txnDate!)) {
      revalidationErrors.push({ field: 'rows', message: `Row ${row.rowNumber}: ${ruleError.message}` });
    }
  }
  if (revalidationErrors.length > 0) throw validationFailed(revalidationErrors);

  const insertRows: ImportRowInsertInput[] = [];
  for (const row of selectedRows) {
    const merchantKey = normalizeMerchantKey(row.description);
    let categorySource: CategorySource;
    if (row.categoryOrigin === ImportCategoryOrigin.USER) {
      categorySource = CategorySource.USER;
    } else if (row.categoryOrigin === ImportCategoryOrigin.CSV || row.categoryOrigin === ImportCategoryOrigin.FALLBACK) {
      categorySource = CategorySource.IMPORT;
    } else if (row.aiSuggestedCategoryId !== null && row.aiSuggestedCategoryId !== row.categoryId) {
      categorySource = CategorySource.AI_OVERRIDDEN;
    } else {
      const ruleCategoryId = merchantKey ? await aiService.findRuleCategoryId(userId, merchantKey) : null;
      categorySource = ruleCategoryId !== null && ruleCategoryId === row.categoryId ? CategorySource.RULE : CategorySource.AI_ACCEPTED;
    }

    insertRows.push({
      categoryId: row.categoryId!,
      type: row.type!,
      amount: row.amount!,
      description: row.description,
      txnDate: row.txnDate!,
      categorySource,
      aiSuggestedCategoryId: row.aiSuggestedCategoryId,
      aiConfidence: row.aiConfidence,
    });
  }

  const now = new Date();
  const inserted = await prisma.$transaction(
    async (tx) => {
      // Status guard FIRST, inside the transaction: a concurrent/duplicate commit attempt (a
      // retry with no/a different Idempotency-Key) finds 0 rows updated and throws 409, rolling
      // back everything below — the batch stays exactly `previewed`.
      const claimed = await importsRepository.setStatus(
        id,
        userId,
        [ImportBatchStatus.PREVIEWED],
        { status: ImportBatchStatus.COMMITTED, committedRows: insertRows.length, committedAt: now },
        tx,
      );
      if (claimed === 0) throw conflict('This import has already been committed.');

      return insertImportedTransactions(tx, userId, id, user.currency, insertRows);
    },
    { timeout: IMPORT_COMMIT_TX_TIMEOUT_MS, maxWait: 10_000 },
  );

  const months = [...new Set(inserted.map((row) => firstDayOfMonth(fromDbDate(row.txnDate))))];
  const categoryMonthKeys = new Set<string>();
  const categoryMonths: { categoryId: number; month: string }[] = [];
  for (const row of inserted) {
    const month = firstDayOfMonth(fromDbDate(row.txnDate));
    const key = `${row.categoryId}:${month}`;
    if (!categoryMonthKeys.has(key)) {
      categoryMonthKeys.add(key);
      categoryMonths.push({ categoryId: row.categoryId, month });
    }
  }
  if (months.length > 0) {
    emitAfterCommit('transactions.imported', { userId, batchId: id, months, categoryMonths });
  }

  const errorRows = batch.totalRows - batch.validRows;
  await recordAudit({
    action: 'import.committed',
    actorId: userId,
    actorRole: 'student',
    entityType: 'import_batch',
    entityId: id,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    metadata: { committedRows: inserted.length, errorRows, months: months.length },
  });

  await deletePreviewKeys(id);

  return {
    committedRows: inserted.length,
    errorRows,
    skippedRows: batch.validRows - inserted.length,
    errorReportUrl: errorRows > 0 ? `${API_BASE_PATH}/imports/${id}/errors.csv` : null,
  };
}

/**
 * `GET /imports/:id/errors.csv` — downloadable per-row error report, built from the summary
 * persisted to `ImportBatch.errorReport` so it keeps working after the Redis preview expires.
 * @throws {AppError} 404 when not found or not owned by `userId`.
 */
export async function buildErrorsCsv(userId: string, id: string): Promise<string> {
  const batch = await importsRepository.findOwned(id, userId);
  if (!batch) throw notFound('Import batch not found.');

  const report = batch.errorReport as unknown as ImportErrorReport | null;
  const rows = (report?.errorRows ?? []).map((r) => [r.rowNumber, r.date, r.amount, r.type, r.description, r.category, r.errors.join('; ')]);
  return toCsv(['row', 'date', 'amount', 'type', 'description', 'category', 'error'], rows);
}
