/**
 * hooks.ts
 * TanStack Query hooks for the P16 privacy actions in Profile & Settings › Privacy: data export
 * and account deletion. Neither invalidates any cached query — an export is read-only and a
 * successful deletion immediately logs the user out (handled by the caller), so there is nothing
 * left in the cache to keep fresh.
 * Exports: useExportMyDataMutation, useDeleteAccountMutation
 * Spec: docs/spec/09 §9.14
 */
import type { DeleteAccountInput, ExportQueryInput } from '@campuscoin/shared';
import { useMutation } from '@tanstack/react-query';
import type { ApiError } from '../../lib/apiClient/apiError';
import { deleteAccount, exportMyData, type DeleteAccountResponse, type ExportResult } from './api';

/** Downloads the user's data export in the requested format (caller triggers the "Save As"). */
export function useExportMyDataMutation() {
  return useMutation<ExportResult, ApiError, ExportQueryInput['format']>({
    mutationFn: (format) => exportMyData(format),
  });
}

/** Requests account deletion; on success the server has already cleared the refresh cookie. */
export function useDeleteAccountMutation() {
  return useMutation<DeleteAccountResponse, ApiError, DeleteAccountInput>({
    mutationFn: (input) => deleteAccount(input),
  });
}
