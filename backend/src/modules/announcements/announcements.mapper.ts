/**
 * announcements.mapper.ts
 * Maps a Prisma `Announcement` row to the public {@link AnnouncementDto}. `createdBy` is never
 * sent to the client (CLAUDE.md security invariant — it is an internal admin user id).
 * Main exports: toAnnouncementDto
 * Spec: docs/spec/05c §5.13 (announcement DTO)
 */
import type { AnnouncementDto, AnnouncementLevel } from '@campuscoin/shared';
import type { AnnouncementModel } from '../../generated/prisma/models/Announcement.js';

/**
 * Converts a Prisma `Announcement` row into the public {@link AnnouncementDto}.
 * @param announcement - Full row, as read from the DB (never partially selected).
 */
export function toAnnouncementDto(announcement: AnnouncementModel): AnnouncementDto {
  return {
    id: announcement.id,
    title: announcement.title,
    body: announcement.body,
    level: announcement.level as AnnouncementLevel,
    startsAt: announcement.startsAt.toISOString(),
    endsAt: announcement.endsAt ? announcement.endsAt.toISOString() : null,
  };
}
