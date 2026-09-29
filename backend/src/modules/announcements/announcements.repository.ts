/**
 * announcements.repository.ts
 * Prisma access for system-wide announcements. Read-only in P09 (admin CRUD ships in P15) — this
 * module only ever reads currently-active rows for the public/student banner.
 * Main exports: announcementsRepository
 * Spec: docs/spec/05c §5.13 (announcements) · docs/spec/06 (announcements table)
 */
import type { AnnouncementModel } from '../../generated/prisma/models/Announcement.js';
import type { AppPrismaClient } from '../../lib/prisma.js';
import { prisma } from '../../lib/prisma.js';

export const announcementsRepository = {
  /** Announcements currently visible: active, started, and not yet ended (or with no end date). */
  listActive(now: Date, db: AppPrismaClient = prisma): Promise<AnnouncementModel[]> {
    return db.announcement.findMany({
      where: { isActive: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      orderBy: { startsAt: 'desc' },
    });
  },
};
