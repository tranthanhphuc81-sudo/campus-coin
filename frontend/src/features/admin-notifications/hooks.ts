/**
 * hooks.ts
 * TanStack Query hooks for `/admin/announcements`: list + create/update/delete mutations. Also
 * invalidates the student-facing `['announcements']` query (`features/announcements/hooks.ts`) on
 * every mutation, so a newly created/edited/deleted announcement's effect on `GET /announcements/active`
 * is reflected without waiting for that query's 5-minute `staleTime`.
 * Exports: adminAnnouncementsQueryKey, useAdminAnnouncementsQuery, useCreateAdminAnnouncementMutation,
 *   useUpdateAdminAnnouncementMutation, useDeleteAdminAnnouncementMutation
 * Spec: docs/spec/05c §5.13 · docs/spec/07 §7.3.3, §7.3.4
 */
import type { AdminAnnouncementDto, CreateAnnouncementInput, UpdateAnnouncementInput } from '@campuscoin/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createAdminAnnouncement, deleteAdminAnnouncement, listAdminAnnouncements, updateAdminAnnouncement } from './api';

/** Query key for the admin `/admin/announcements` list (no server-side filters). */
export function adminAnnouncementsQueryKey() {
  return ['admin', 'announcements', 'list'] as const;
}

/** Reads every announcement (active, scheduled, expired, inactive). */
export function useAdminAnnouncementsQuery() {
  return useQuery<AdminAnnouncementDto[]>({
    queryKey: adminAnnouncementsQueryKey(),
    queryFn: () => listAdminAnnouncements(),
    refetchOnWindowFocus: false,
  });
}

function invalidateAnnouncements(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] });
  // Keeps the student-facing banner (`features/announcements`) in sync with admin changes.
  void queryClient.invalidateQueries({ queryKey: ['announcements'] });
}

/** Creates an announcement. */
export function useCreateAdminAnnouncementMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAnnouncementInput) => createAdminAnnouncement(input),
    onSuccess: () => invalidateAnnouncements(queryClient),
  });
}

/** Updates an announcement (also used to toggle `isActive`). */
export function useUpdateAdminAnnouncementMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateAnnouncementInput }) => updateAdminAnnouncement(id, input),
    onSuccess: () => invalidateAnnouncements(queryClient),
  });
}

/** Deletes an announcement (hard delete, always succeeds). */
export function useDeleteAdminAnnouncementMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteAdminAnnouncement(id),
    onSuccess: () => invalidateAnnouncements(queryClient),
  });
}
