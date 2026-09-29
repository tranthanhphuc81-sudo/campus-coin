/**
 * api.ts
 * Thin wrappers around `/admin/announcements` (system announcement CRUD). Mounted at the
 * `/admin/notifications` route — "System Notifications" in the admin nav means these banner
 * announcements, not the per-student notification bell.
 * Exports: listAdminAnnouncements, createAdminAnnouncement, updateAdminAnnouncement,
 *   deleteAdminAnnouncement
 * Spec: docs/spec/05c §5.13 · docs/spec/07 §7.3.3, §7.3.4
 */
import type { AdminAnnouncementDto, CreateAnnouncementInput, UpdateAnnouncementInput } from '@campuscoin/shared';
import { apiClient } from '../../lib/apiClient/apiClient';

/** `GET /admin/announcements` — every announcement, incl. `isActive` and past/future ones. */
export async function listAdminAnnouncements(): Promise<AdminAnnouncementDto[]> {
  const response = await apiClient.get<AdminAnnouncementDto[]>('/admin/announcements');
  return response.data;
}

/** `POST /admin/announcements`. */
export async function createAdminAnnouncement(input: CreateAnnouncementInput): Promise<AdminAnnouncementDto> {
  const response = await apiClient.post<AdminAnnouncementDto>('/admin/announcements', input);
  return response.data;
}

/** `PATCH /admin/announcements/:id` — also used to toggle `isActive`. */
export async function updateAdminAnnouncement(id: number, input: UpdateAnnouncementInput): Promise<AdminAnnouncementDto> {
  const response = await apiClient.patch<AdminAnnouncementDto>(`/admin/announcements/${id}`, input);
  return response.data;
}

/** `DELETE /admin/announcements/:id` — hard delete, always succeeds. */
export async function deleteAdminAnnouncement(id: number): Promise<void> {
  await apiClient.delete(`/admin/announcements/${id}`);
}
