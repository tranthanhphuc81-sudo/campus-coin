/**
 * api.ts
 * Thin wrapper around the public `GET /announcements/active` endpoint (no auth required, but
 * still fine to call from the authenticated student layout).
 * Exports: listActiveAnnouncements
 * Spec: docs/spec/05c §5.13 (announcements)
 */
import type { AnnouncementDto } from '@campuscoin/shared';
import { apiClient } from '../../lib/apiClient/apiClient';

/** `GET /announcements/active` — every currently-active system announcement. */
export async function listActiveAnnouncements(): Promise<AnnouncementDto[]> {
  const response = await apiClient.get<AnnouncementDto[]>('/announcements/active');
  return response.data;
}
