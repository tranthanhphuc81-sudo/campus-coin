/**
 * admin-announcements.repository.ts
 * Prisma access for admin CRUD of system announcements.
 * Main exports: adminAnnouncementsRepository, CreateAnnouncementData, UpdateAnnouncementData
 * Spec: docs/spec/05c §5.13
 */
import type { AnnouncementLevel } from '@campuscoin/shared';
import type { AnnouncementModel } from '../../generated/prisma/models/Announcement.js';
import type { AppPrismaClient } from '../../lib/prisma.js';
import { prisma } from '../../lib/prisma.js';

/** Fields accepted by {@link adminAnnouncementsRepository.create}. */
export interface CreateAnnouncementData {
  title: string;
  body: string;
  level: AnnouncementLevel;
  startsAt: Date;
  endsAt: Date | null;
  createdBy: string;
}

/** Partial update accepted by {@link adminAnnouncementsRepository.update}. */
export interface UpdateAnnouncementData {
  title?: string;
  body?: string;
  level?: AnnouncementLevel;
  startsAt?: Date;
  endsAt?: Date | null;
  isActive?: boolean;
}

export const adminAnnouncementsRepository = {
  /** Every announcement, small table so no pagination — newest-starting first. */
  findAll(db: AppPrismaClient = prisma): Promise<AnnouncementModel[]> {
    return db.announcement.findMany({ orderBy: { startsAt: 'desc' } });
  },

  findById(id: number, db: AppPrismaClient = prisma): Promise<AnnouncementModel | null> {
    return db.announcement.findUnique({ where: { id } });
  },

  create(data: CreateAnnouncementData, db: AppPrismaClient = prisma): Promise<AnnouncementModel> {
    return db.announcement.create({ data });
  },

  update(id: number, data: UpdateAnnouncementData, db: AppPrismaClient = prisma): Promise<AnnouncementModel> {
    return db.announcement.update({ where: { id }, data });
  },

  delete(id: number, db: AppPrismaClient = prisma): Promise<AnnouncementModel> {
    return db.announcement.delete({ where: { id } });
  },
};
