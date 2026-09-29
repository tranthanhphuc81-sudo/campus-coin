/**
 * hooks.ts
 * TanStack Query hook for the active system announcements banner.
 * Exports: activeAnnouncementsQueryKey, useActiveAnnouncementsQuery
 * Spec: docs/spec/05c §5.13 (announcements)
 */
import type { AnnouncementDto } from '@campuscoin/shared';
import { useQuery } from '@tanstack/react-query';
import { listActiveAnnouncements } from './api';

/** Query key for the active-announcements list. */
export function activeAnnouncementsQueryKey() {
  return ['announcements', 'active'] as const;
}

/** Reads every currently-active system announcement. */
export function useActiveAnnouncementsQuery() {
  return useQuery<AnnouncementDto[]>({
    queryKey: activeAnnouncementsQueryKey(),
    queryFn: () => listActiveAnnouncements(),
    staleTime: 5 * 60_000,
  });
}
