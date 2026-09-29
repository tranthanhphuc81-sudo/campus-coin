/**
 * admin-announcements.service.ts
 * Business logic for admin CRUD of system announcements. Every write busts the (global, not
 * per-user) `announcements:active` cache key so `GET /announcements/active` reflects the change
 * immediately instead of waiting out its TTL.
 * Main exports: list, create, update, remove
 * Spec: docs/spec/05c §5.13
 */
import type { AdminAnnouncementDto, CreateAnnouncementInput, UpdateAnnouncementInput } from '@campuscoin/shared';
import { cacheDel } from '../../lib/cache.js';
import { announcementsActiveKey } from '../../lib/cacheKeys.js';
import { notFound } from '../../lib/problem.js';
import { adminAnnouncementsRepository } from './admin-announcements.repository.js';
import { toAdminAnnouncementDto } from './admin-announcements.mapper.js';

/** `GET /admin/announcements` — every announcement (small table, no pagination). */
export async function list(): Promise<AdminAnnouncementDto[]> {
  const rows = await adminAnnouncementsRepository.findAll();
  return rows.map(toAdminAnnouncementDto);
}

/** Creates an announcement. */
export async function create(input: CreateAnnouncementInput, createdBy: string): Promise<AdminAnnouncementDto> {
  const created = await adminAnnouncementsRepository.create({
    title: input.title,
    body: input.body,
    level: input.level,
    startsAt: new Date(input.startsAt),
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
    createdBy,
  });
  await cacheDel(announcementsActiveKey());
  return toAdminAnnouncementDto(created);
}

/**
 * Updates an announcement.
 * @throws {AppError} 404 when `id` is not an announcement.
 */
export async function update(id: number, input: UpdateAnnouncementInput): Promise<AdminAnnouncementDto> {
  const current = await adminAnnouncementsRepository.findById(id);
  if (!current) throw notFound('Announcement not found.');

  const updated = await adminAnnouncementsRepository.update(id, {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.body !== undefined ? { body: input.body } : {}),
    ...(input.level !== undefined ? { level: input.level } : {}),
    ...(input.startsAt !== undefined ? { startsAt: new Date(input.startsAt) } : {}),
    ...(input.endsAt !== undefined ? { endsAt: input.endsAt ? new Date(input.endsAt) : null } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
  });
  await cacheDel(announcementsActiveKey());
  return toAdminAnnouncementDto(updated);
}

/**
 * Hard-deletes an announcement (no FK references an announcement anywhere, so this is always safe).
 * @throws {AppError} 404 when `id` is not an announcement.
 */
export async function remove(id: number): Promise<void> {
  const current = await adminAnnouncementsRepository.findById(id);
  if (!current) throw notFound('Announcement not found.');

  await adminAnnouncementsRepository.delete(id);
  await cacheDel(announcementsActiveKey());
}
