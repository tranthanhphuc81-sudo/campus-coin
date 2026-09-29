/**
 * hooks.ts
 * TanStack Query hooks for `/transactions` (list/detail/history + create/update/delete/restore/
 * resolve-flag mutations) and `/recurring-rules` (list + create/update/delete). The create and
 * delete mutations apply an optimistic update to any cached transactions list they plausibly
 * belong to, reconciled by a real refetch once the request settles.
 * Exports: transactionsListQueryKey, transactionQueryKey, transactionHistoryQueryKey,
 *   recurringRulesQueryKey, useTransactionsQuery, useTransactionQuery,
 *   useTransactionHistoryQuery, useCreateTransactionMutation, useUpdateTransactionMutation,
 *   useDeleteTransactionMutation, useRestoreTransactionMutation, useResolveFlagMutation,
 *   useRecurringRulesQuery, useCreateRecurringRuleMutation, useUpdateRecurringRuleMutation,
 *   useDeleteRecurringRuleMutation
 * Spec: docs/spec/05a §5.4 (transactions), §5.4.2 (recurring)
 */
import type {
  CategoryDto,
  CreateRecurringRuleInput,
  CreateTransactionInput,
  ListTransactionsQueryInput,
  RecurringRuleDto,
  ResolveFlagInput,
  TransactionDto,
  UpdateRecurringRuleInput,
  UpdateTransactionInput,
} from '@campuscoin/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import {
  createRecurringRule,
  createTransaction,
  deleteRecurringRule,
  deleteTransaction,
  getTransaction,
  getTransactionHistory,
  listRecurringRules,
  listTransactions,
  resolveFlag,
  restoreTransaction,
  updateRecurringRule,
  updateTransaction,
  type TransactionListResponse,
} from './api';

/** Query key for a `/transactions` list, scoped by its exact filter/sort/page params. */
export function transactionsListQueryKey(query: ListTransactionsQueryInput) {
  return ['transactions', 'list', query] as const;
}

/** Query key for a single transaction (used by the detail/edit drawer). */
export function transactionQueryKey(id: string) {
  return ['transactions', 'detail', id] as const;
}

/** Query key for a transaction's change history timeline. */
export function transactionHistoryQueryKey(id: string) {
  return ['transactions', 'history', id] as const;
}

/** Query key for the caller's recurring rules (no server-side pagination/filtering). */
export function recurringRulesQueryKey() {
  return ['recurringRules', 'list'] as const;
}

/** Reads a page of `/transactions` for the given filters (also how the Trash is read, via `deleted: true`). */
export function useTransactionsQuery(query: ListTransactionsQueryInput) {
  return useQuery<TransactionListResponse>({
    queryKey: transactionsListQueryKey(query),
    queryFn: () => listTransactions(query),
    placeholderData: (previous) => previous,
  });
}

/** Reads a single transaction by id (the detail/edit drawer's Details tab). */
export function useTransactionQuery(id: string | null) {
  return useQuery<TransactionDto>({
    queryKey: transactionQueryKey(id ?? ''),
    queryFn: () => getTransaction(id as string),
    enabled: id !== null,
  });
}

/** Reads a transaction's change history (Details/History tab of the detail drawer). */
export function useTransactionHistoryQuery(id: string | null) {
  return useQuery({
    queryKey: transactionHistoryQueryKey(id ?? ''),
    queryFn: () => getTransactionHistory(id as string),
    enabled: id !== null,
  });
}

/** Invalidates every cached transactions query, plus the not-yet-built dashboard/budgets widgets that read transaction totals (P09) — a harmless no-op today, load-bearing once those queries exist. */
function invalidateAfterTransactionChange(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['transactions'] });
  void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  void queryClient.invalidateQueries({ queryKey: ['budgets'] });
}

/** True when `txn` would appear under this list query's filters (best-effort, for the optimistic insert only — the real filter logic lives server-side). */
function matchesListFilters(txn: TransactionDto, query: ListTransactionsQueryInput): boolean {
  if ((query.deleted ?? false) !== false) return false;
  if (query.type && txn.type !== query.type) return false;
  if (query.from && txn.txnDate < query.from) return false;
  if (query.to && txn.txnDate > query.to) return false;
  if (query.categoryId && !query.categoryId.includes(txn.categoryId)) return false;
  if (query.minAmount && Number(txn.amount) < Number(query.minAmount)) return false;
  if (query.maxAmount && Number(txn.amount) > Number(query.maxAmount)) return false;
  if (query.q && !(txn.description ?? '').toLowerCase().includes(query.q.toLowerCase())) return false;
  return true;
}

/** Finds a category (for building an optimistic `TransactionDto.category`) in any cached `/categories` list. */
function findCachedCategory(queryClient: QueryClient, categoryId: number): CategoryDto | undefined {
  const categoryQueries = queryClient.getQueriesData<CategoryDto[]>({ queryKey: ['categories'] });
  for (const [, categories] of categoryQueries) {
    const match = categories?.find((c) => c.id === categoryId);
    if (match) return match;
  }
  return undefined;
}

/** Snapshots every cached transactions-list query matching `keyPrefix`, for optimistic-update rollback. */
function snapshotLists(queryClient: QueryClient, keyPrefix: QueryKey) {
  return queryClient.getQueriesData<TransactionListResponse>({ queryKey: keyPrefix });
}

function restoreSnapshot(queryClient: QueryClient, snapshot: ReturnType<typeof snapshotLists>) {
  for (const [key, data] of snapshot) {
    queryClient.setQueryData(key, data);
  }
}

/**
 * Creates a transaction with an `Idempotency-Key` unique to this submit attempt, and optimistically
 * inserts it into any cached first-page list it plausibly matches (BR: quick-add feels instant).
 */
export function useCreateTransactionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTransactionInput) => createTransaction(input, crypto.randomUUID()),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['transactions', 'list'] });
      const snapshot = snapshotLists(queryClient, ['transactions', 'list']);
      const category = findCachedCategory(queryClient, input.categoryId);
      // Every transaction of a user shares the same account currency; borrow it from any cached
      // list entry (falls back to USD only for a user's very first-ever transaction).
      const currency = snapshot.find(([, list]) => list && list.data.length > 0)?.[1]?.data[0]?.currency ?? 'USD';
      if (category) {
        // D1 (P10): the server derives `categorySource` from `aiSuggestedCategoryId` vs. the
        // chosen `categoryId` (plus a learned-rule lookup this optimistic client can't perform —
        // the real refetch reconciles that `'rule'` case moments later).
        const categorySource: TransactionDto['categorySource'] =
          input.aiSuggestedCategoryId == null ? 'user' : input.aiSuggestedCategoryId !== input.categoryId ? 'ai_overridden' : 'ai_accepted';
        const optimistic: TransactionDto = {
          id: `optimistic-${crypto.randomUUID()}`,
          type: input.type,
          categoryId: input.categoryId,
          category,
          amount: input.amount,
          currency,
          description: input.description ?? null,
          txnDate: input.txnDate,
          source: 'manual',
          recurringRuleId: null,
          recurringPeriod: null,
          categorySource,
          aiSuggestedCategoryId: input.aiSuggestedCategoryId ?? null,
          aiConfidence: input.aiConfidence ?? null,
          isAnomaly: false,
          isPossibleDuplicate: false,
          version: 1,
          deletedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        for (const [key, listResponse] of snapshot) {
          const query = key[2] as ListTransactionsQueryInput;
          if ((query.page ?? 1) !== 1 || !listResponse || !matchesListFilters(optimistic, query)) continue;
          queryClient.setQueryData<TransactionListResponse>(key, {
            data: [optimistic, ...listResponse.data].slice(0, query.limit ?? listResponse.data.length),
            meta: { ...listResponse.meta, total: listResponse.meta.total + 1 },
          });
        }
      }
      return { snapshot };
    },
    onError: (_err, _input, context) => {
      if (context) restoreSnapshot(queryClient, context.snapshot);
    },
    onSettled: () => invalidateAfterTransactionChange(queryClient),
  });
}

/** `PATCH /transactions/:id` — BR-TX-05: caller must pass the last known `version` in `input`. */
export function useUpdateTransactionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTransactionInput }) => updateTransaction(id, input),
    onSuccess: () => invalidateAfterTransactionChange(queryClient),
  });
}

/** Soft-deletes a transaction, optimistically removing it from every cached list (BR-TX-07: recoverable from Trash). */
export function useDeleteTransactionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTransaction(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['transactions', 'list'] });
      const snapshot = snapshotLists(queryClient, ['transactions', 'list']);
      for (const [key, listResponse] of snapshot) {
        if (!listResponse) continue;
        queryClient.setQueryData<TransactionListResponse>(key, {
          data: listResponse.data.filter((t) => t.id !== id),
          meta: { ...listResponse.meta, total: Math.max(0, listResponse.meta.total - 1) },
        });
      }
      return { snapshot };
    },
    onError: (_err, _id, context) => {
      if (context) restoreSnapshot(queryClient, context.snapshot);
    },
    onSettled: () => invalidateAfterTransactionChange(queryClient),
  });
}

/** `POST /transactions/:id/restore` — used by the Trash page and by the delete toast's "Undo". */
export function useRestoreTransactionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreTransaction(id),
    onSuccess: () => invalidateAfterTransactionChange(queryClient),
  });
}

/**
 * `POST /transactions/:id/resolve-flag` — `action:'keep'` clears the flag (the drawer stays open,
 * showing the now-unflagged transaction); `action:'delete'` soft-deletes it (same as the regular
 * delete flow, BR-TX-07). Either way the response is the updated transaction, so the single
 * cached detail query is refreshed directly (no need to wait for the broader invalidate to refetch).
 */
export function useResolveFlagMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ResolveFlagInput }) => resolveFlag(id, input),
    onSuccess: (data) => {
      queryClient.setQueryData(transactionQueryKey(data.id), data);
      invalidateAfterTransactionChange(queryClient);
    },
  });
}

// ---- Recurring rules --------------------------------------------------------------------------

/** Reads every recurring rule owned by the caller. */
export function useRecurringRulesQuery() {
  return useQuery<RecurringRuleDto[]>({
    queryKey: recurringRulesQueryKey(),
    queryFn: () => listRecurringRules(),
  });
}

function invalidateRecurringRules(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: ['recurringRules'] });
}

/** Creates a recurring rule. */
export function useCreateRecurringRuleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRecurringRuleInput) => createRecurringRule(input),
    onSuccess: () => invalidateRecurringRules(queryClient),
  });
}

/** Updates a recurring rule (future occurrences only) — also used for pause/resume via `isActive`. */
export function useUpdateRecurringRuleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateRecurringRuleInput }) => updateRecurringRule(id, input),
    onSuccess: () => invalidateRecurringRules(queryClient),
  });
}

/** Deletes a recurring rule; previously generated transactions are kept. */
export function useDeleteRecurringRuleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteRecurringRule(id),
    onSuccess: () => invalidateRecurringRules(queryClient),
  });
}
