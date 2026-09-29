/**
 * announcementStatus.test.ts
 * Unit tests for `deriveAnnouncementStatus` (pure lifecycle-status derivation).
 * Spec: docs/spec/08 §8.3 (admin announcements table)
 */
import { describe, expect, it } from 'vitest';
import { deriveAnnouncementStatus } from './announcementStatus';

const NOW = new Date('2026-06-15T12:00:00.000Z');

describe('deriveAnnouncementStatus', () => {
  it('returns "inactive" whenever isActive is false, regardless of dates', () => {
    expect(
      deriveAnnouncementStatus({ isActive: false, startsAt: '2026-01-01T00:00:00.000Z', endsAt: null }, NOW),
    ).toBe('inactive');
    expect(
      deriveAnnouncementStatus(
        { isActive: false, startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2099-01-01T00:00:00.000Z' },
        NOW,
      ),
    ).toBe('inactive');
  });

  it('returns "scheduled" when now is before startsAt', () => {
    expect(
      deriveAnnouncementStatus({ isActive: true, startsAt: '2026-07-01T00:00:00.000Z', endsAt: null }, NOW),
    ).toBe('scheduled');
  });

  it('returns "expired" when endsAt is set and now is after it', () => {
    expect(
      deriveAnnouncementStatus(
        { isActive: true, startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-06-01T00:00:00.000Z' },
        NOW,
      ),
    ).toBe('expired');
  });

  it('returns "active" when now is within [startsAt, endsAt]', () => {
    expect(
      deriveAnnouncementStatus(
        { isActive: true, startsAt: '2026-06-01T00:00:00.000Z', endsAt: '2026-07-01T00:00:00.000Z' },
        NOW,
      ),
    ).toBe('active');
  });

  it('returns "active" when isActive and startsAt is in the past with no endsAt', () => {
    expect(
      deriveAnnouncementStatus({ isActive: true, startsAt: '2026-01-01T00:00:00.000Z', endsAt: null }, NOW),
    ).toBe('active');
  });

  it('treats an endsAt exactly equal to now as still active (boundary is exclusive on the expired side)', () => {
    expect(
      deriveAnnouncementStatus(
        { isActive: true, startsAt: '2026-01-01T00:00:00.000Z', endsAt: NOW.toISOString() },
        NOW,
      ),
    ).toBe('active');
  });
});
