/**
 * announcements.service.ts
 * Business logic for the public/student "active announcements" banner. Read-only in P09 (admin
 * CRUD ships in P15) — cached for {@link ANNOUNCEMENTS_CACHE_TTL_SEC} since this list is the same
 * for every caller and changes rarely.
 * Main exports: listActive
 * Spec: docs/spec/05c §5.13 (announcements) · docs/spec/10 §10.3 (cache strategy)
 */
import { ANNOUNCEMENTS_CACHE_TTL_SEC, type AnnouncementDto } from '@campuscoin/shared';
import { cacheGet, cacheSet } from '../../lib/cache.js';
import { announcementsActiveKey } from '../../lib/cacheKeys.js';
import { announcementsRepository } from './announcements.repository.js';
import { toAnnouncementDto } from './announcements.mapper.js';

/** Every currently-active announcement (started, not yet ended), newest first. */
export async function listActive(): Promise<AnnouncementDto[]> {
  const key = announcementsActiveKey();
  const cached = await cacheGet<AnnouncementDto[]>(key);
  if (cached) return cached;

  const rows = await announcementsRepository.listActive(new Date());
  const dtos = rows.map(toAnnouncementDto);
  await cacheSet(key, dtos, ANNOUNCEMENTS_CACHE_TTL_SEC);
  return dtos;
}
