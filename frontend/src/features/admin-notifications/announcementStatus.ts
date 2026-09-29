/**
 * announcementStatus.ts
 * Pure client-side derivation of an announcement's displayed lifecycle status from `isActive` +
 * `startsAt`/`endsAt`, per spec §8.3's literal wording ("Active"/"Scheduled"/"Expired"). The
 * database only stores `isActive`; "Scheduled"/"Expired" are computed relative to `now` so the
 * admin table never needs a server round-trip just to reflect the passage of time.
 * Exports: AnnouncementStatus, deriveAnnouncementStatus
 * Spec: docs/spec/08 §8.3 (admin announcements table)
 */

/** Displayed lifecycle status of an announcement in the admin table. */
export type AnnouncementStatus = 'active' | 'scheduled' | 'expired' | 'inactive';

/** Minimal shape {@link deriveAnnouncementStatus} needs from an announcement DTO. */
export interface AnnouncementStatusInput {
  isActive: boolean;
  startsAt: string;
  endsAt: string | null;
}

/**
 * Derives an announcement's displayed status.
 * - `isActive === false` -> `'inactive'` (an admin manually turned it off, regardless of dates).
 * - `now < startsAt` -> `'scheduled'` (not live yet).
 * - `endsAt` set and `now > endsAt` -> `'expired'`.
 * - otherwise -> `'active'`.
 * @param announcement - `{ isActive, startsAt, endsAt }` of the announcement.
 * @param now - the current time (injectable for deterministic tests; defaults to `new Date()`).
 */
export function deriveAnnouncementStatus(announcement: AnnouncementStatusInput, now: Date = new Date()): AnnouncementStatus {
  if (!announcement.isActive) return 'inactive';
  const nowMs = now.getTime();
  if (nowMs < Date.parse(announcement.startsAt)) return 'scheduled';
  if (announcement.endsAt !== null && nowMs > Date.parse(announcement.endsAt)) return 'expired';
  return 'active';
}
