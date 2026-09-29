/**
 * api.ts
 * Thin wrappers around `/transactions` (list/create/update/soft-delete/restore/history/resolve-flag)
 * and `/recurring-rules` (list/create/update/delete — pause/resume is `PATCH {isActive}`, there is
 * no dedicated endpoint for it).
 * Exports: listTransactions, getTransaction, createTransaction, updateTransaction,
 *   deleteTransaction, restoreTransaction, getTransactionHistory, resolveFlag,
 *   listRecurringRules, createRecurringRule, updateRecurringRule, deleteRecurringRule,
 *   TransactionListResponse
 * Spec: docs/spec/05a §5.4 (transactions), §5.4.2 (recurring) · Rules: BR-TX-01..08
 */
import type {
  CreateRecurringRuleInput,
  CreateTransactionInput,
  ListTransactionsQueryInput,
  RecurringRuleDto,
  ResolveFlagInput,
  TransactionDto,
  TransactionHistoryDto,
  UpdateRecurringRuleInput,
  UpdateTransactionInput,
} from '@campuscoin/shared';
import { apiClient } from '../../lib/apiClient/apiClient';

/** Pagination envelope returned by `GET /transactions`. */
export interface TransactionListResponse {
  data: TransactionDto[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

// ---- Transactions ---------------------------------------------------------------------------

/** `GET /transactions` — BR-TX-08: paginated, filterable list (`deleted=true` reads the Trash). */
export async function listTransactions(query: ListTransactionsQueryInput): Promise<TransactionListResponse> {
  const response = await apiClient.get<TransactionListResponse>('/transactions', { params: query });
  return response.data;
}

/** `GET /transactions/:id` — a single active (non-deleted) transaction. */
export async function getTransaction(id: string): Promise<TransactionDto> {
  const response = await apiClient.get<TransactionDto>(`/transactions/${id}`);
  return response.data;
}

/**
 * `POST /transactions`. `idempotencyKey` should be a fresh UUID per submit attempt (a retry of
 * the *same* attempt reuses the same key) so a double-tap or network retry never double-creates.
 */
export async function createTransaction(
  input: CreateTransactionInput,
  idempotencyKey: string,
): Promise<TransactionDto & { recurringRule?: RecurringRuleDto }> {
  const response = await apiClient.post<TransactionDto & { recurringRule?: RecurringRuleDto }>('/transactions', input, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return response.data;
}

/** `PATCH /transactions/:id` — BR-TX-05: `input.version` must be the last known version. */
export async function updateTransaction(id: string, input: UpdateTransactionInput): Promise<TransactionDto> {
  const response = await apiClient.patch<TransactionDto>(`/transactions/${id}`, input);
  return response.data;
}

/** `DELETE /transactions/:id` — soft delete (BR-TX-07: recoverable from Trash for 30 days). */
export async function deleteTransaction(id: string): Promise<void> {
  await apiClient.delete(`/transactions/${id}`);
}

/** `POST /transactions/:id/restore` — restores a still-recoverable (< 30 days) soft-deleted transaction. */
export async function restoreTransaction(id: string): Promise<TransactionDto> {
  const response = await apiClient.post<TransactionDto>(`/transactions/${id}/restore`);
  return response.data;
}

/** `GET /transactions/:id/history` — BR-TX-06: append-only edit/delete/restore timeline, oldest first. */
export async function getTransactionHistory(id: string): Promise<TransactionHistoryDto[]> {
  const response = await apiClient.get<TransactionHistoryDto[]>(`/transactions/${id}/history`);
  return response.data;
}

/** `POST /transactions/:id/resolve-flag` — `action:'keep'` clears the anomaly/duplicate flag, `action:'delete'` soft-deletes the transaction (P14). */
export async function resolveFlag(id: string, input: ResolveFlagInput): Promise<TransactionDto> {
  const response = await apiClient.post<TransactionDto>(`/transactions/${id}/resolve-flag`, input);
  return response.data;
}

// ---- Recurring rules --------------------------------------------------------------------------

/** `GET /recurring-rules` — every rule owned by the caller (no pagination/filtering server-side). */
export async function listRecurringRules(): Promise<RecurringRuleDto[]> {
  const response = await apiClient.get<RecurringRuleDto[]>('/recurring-rules');
  return response.data;
}

/** `POST /recurring-rules`. */
export async function createRecurringRule(input: CreateRecurringRuleInput): Promise<RecurringRuleDto> {
  const response = await apiClient.post<RecurringRuleDto>('/recurring-rules', input);
  return response.data;
}

/** `PATCH /recurring-rules/:id` — also used for pause (`isActive:false`) / resume (`isActive:true`). */
export async function updateRecurringRule(id: number, input: UpdateRecurringRuleInput): Promise<RecurringRuleDto> {
  const response = await apiClient.patch<RecurringRuleDto>(`/recurring-rules/${id}`, input);
  return response.data;
}

/** `DELETE /recurring-rules/:id` — hard delete; previously generated transactions are kept. */
export async function deleteRecurringRule(id: number): Promise<void> {
  await apiClient.delete(`/recurring-rules/${id}`);
}
