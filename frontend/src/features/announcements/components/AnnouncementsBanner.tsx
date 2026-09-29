/**
 * AnnouncementsBanner.tsx
 * Dismissible-for-this-browser-tab-session banner for active system announcements, shown at the
 * top of the student layout's content area. Dismissal is tracked in `sessionStorage` only — there
 * is no server-side "seen" tracking (P09 scope).
 * Exports: AnnouncementsBanner
 * Spec: docs/spec/05c §5.13 (announcements)
 */
import type { AnnouncementDto } from '@campuscoin/shared';
import { useState } from 'react';
import { en } from '../../../i18n/en';
import { useActiveAnnouncementsQuery } from '../hooks';

const DISMISSED_KEY = 'cc.announcements.dismissed';

/** Reads the set of announcement ids dismissed this session; tolerant of storage failures. */
function readDismissed(): Set<number> {
  try {
    const raw = window.sessionStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as number[]) : []);
  } catch {
    return new Set();
  }
}

function persistDismissed(ids: Set<number>): void {
  try {
    window.sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
  } catch {
    // Best-effort only — a storage failure just means the banner may reappear on next render.
  }
}

/** Bootstrap alert variant for an announcement's severity level. */
function alertVariantFor(level: AnnouncementDto['level']): string {
  return level === 'warning' ? 'warning' : 'info';
}

/** Banner listing every active system announcement, dismissible per-tab-session. */
export function AnnouncementsBanner() {
  const announcementsQuery = useActiveAnnouncementsQuery();
  const [dismissed, setDismissed] = useState<Set<number>>(() => readDismissed());

  const announcements = (announcementsQuery.data ?? []).filter((a) => !dismissed.has(a.id));
  if (announcements.length === 0) return null;

  function dismiss(id: number) {
    setDismissed((prev) => {
      const next = new Set(prev).add(id);
      persistDismissed(next);
      return next;
    });
  }

  return (
    <div className="mb-3">
      {announcements.map((announcement) => (
        <div key={announcement.id} className={`alert alert-${alertVariantFor(announcement.level)} d-flex justify-content-between align-items-start gap-2`} role="alert">
          <div>
            <i className={`bi ${announcement.level === 'warning' ? 'bi-exclamation-triangle' : 'bi-info-circle'} me-2`} aria-hidden="true" />
            <strong>{announcement.title}</strong>
            <div>{announcement.body}</div>
          </div>
          <button type="button" className="btn-close" aria-label={en.announcements.dismiss} onClick={() => dismiss(announcement.id)} />
        </div>
      ))}
    </div>
  );
}
