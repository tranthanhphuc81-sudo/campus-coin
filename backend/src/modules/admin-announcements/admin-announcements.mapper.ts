/**
 * admin-announcements.mapper.ts
 * Maps a Prisma `Announcement` row to the admin-facing {@link AdminAnnouncementDto} (every field,
 * incl. `isActive`/`createdAt`/`updatedAt` — unlike the public `announcements.mapper.ts`'s
 * `toAnnouncementDto`, which never exposes those to a logged-out visitor). `createdBy` is still
 * never sent to the client (CLAUDE.md security invariant — it is an internal admin user id).
 * Main exports: toAdminAnnouncementDto
 * Spec: docs/spec/05c §5.13 (admin announcement DTO)
 */
import type { AdminAnnouncementDto, AnnouncementLevel } from '@campuscoin/shared';
import type { AnnouncementModel } from '../../generated/prisma/models/Announcement.js';

/**
 * Converts a Prisma `Announcement` row into the admin-facing {@link AdminAnnouncementDto}.
 * @param announcement - Full row, as read from the DB (never partially selected).
 */
export function toAdminAnnouncementDto(announcement: AnnouncementModel): AdminAnnouncementDto {
  return {
    id: announcement.id,
    title: announcement.title,
    body: announcement.body,
    level: announcement.level as AnnouncementLevel,
    startsAt: announcement.startsAt.toISOString(),
    endsAt: announcement.endsAt ? announcement.endsAt.toISOString() : null,
    isActive: announcement.isActive,
    createdAt: announcement.createdAt.toISOString(),
    updatedAt: announcement.updatedAt.toISOString(),
  };
}
