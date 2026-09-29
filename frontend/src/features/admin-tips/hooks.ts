/**
 * hooks.ts
 * TanStack Query hooks for `/admin/tip-templates`: list + create/update/delete/preview mutations.
 * Preview is a plain mutation (called on-demand from a "Preview" button, never on every keystroke)
 * rather than a query, since it has no cacheable identity. Window-focus refetch is disabled on the
 * list query (no polling in the admin portal — see AdminLayout's idle-logout note).
 * Exports: adminTipTemplatesQueryKey, useAdminTipTemplatesQuery, useCreateAdminTipTemplateMutation,
 *   useUpdateAdminTipTemplateMutation, useDeleteAdminTipTemplateMutation,
 *   usePreviewAdminTipTemplateMutation
 * Spec: docs/spec/05b §5.10
 */
import type { CreateTipTemplateInput, PreviewTipTemplateInput, TipTemplateDto, UpdateTipTemplateInput } from '@campuscoin/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiError } from '../../lib/apiClient/apiError';
import {
  createAdminTipTemplate,
  deleteAdminTipTemplate,
  listAdminTipTemplates,
  previewAdminTipTemplate,
  updateAdminTipTemplate,
  type TipTemplatePreview,
} from './api';

/** Query key for the `/admin/tip-templates` list (no server-side filters). */
export function adminTipTemplatesQueryKey() {
  return ['admin', 'tipTemplates', 'list'] as const;
}

/** Reads every tip template (active and inactive). */
export function useAdminTipTemplatesQuery() {
  return useQuery<TipTemplateDto[]>({
    queryKey: adminTipTemplatesQueryKey(),
    queryFn: () => listAdminTipTemplates(),
    refetchOnWindowFocus: false,
  });
}

function invalidateAdminTipTemplates(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: ['admin', 'tipTemplates'] });
}

/** Creates a tip template; the mutation rejects with a 409 `ApiError` on a duplicate `code`. */
export function useCreateAdminTipTemplateMutation() {
  const queryClient = useQueryClient();
  return useMutation<TipTemplateDto, ApiError, CreateTipTemplateInput>({
    mutationFn: (input: CreateTipTemplateInput) => createAdminTipTemplate(input),
    onSuccess: () => invalidateAdminTipTemplates(queryClient),
  });
}

/** Updates a tip template's title/body templates and/or `isActive` (also used for "deactivate instead"). */
export function useUpdateAdminTipTemplateMutation() {
  const queryClient = useQueryClient();
  return useMutation<TipTemplateDto, ApiError, { id: number; input: UpdateTipTemplateInput }>({
    mutationFn: ({ id, input }: { id: number; input: UpdateTipTemplateInput }) => updateAdminTipTemplate(id, input),
    onSuccess: () => invalidateAdminTipTemplates(queryClient),
  });
}

/** Deletes a tip template; rejects with a 409 `ApiError` if a `UserTip` still references it. */
export function useDeleteAdminTipTemplateMutation() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, number>({
    mutationFn: (id: number) => deleteAdminTipTemplate(id),
    onSuccess: () => invalidateAdminTipTemplates(queryClient),
  });
}

/** Renders an in-progress `{titleTpl, bodyTpl}` edit with fixed sample data, for the form's Preview button. */
export function usePreviewAdminTipTemplateMutation() {
  return useMutation<TipTemplatePreview, ApiError, PreviewTipTemplateInput>({
    mutationFn: (input: PreviewTipTemplateInput) => previewAdminTipTemplate(input),
  });
}
