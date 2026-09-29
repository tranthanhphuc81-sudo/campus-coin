/**
 * lastUsedCategory.ts
 * Remembers the most-recently-used category per (user, transaction type) so the quick-add form
 * can default to it — purely a client-side UX convenience (localStorage), no DB column, mirroring
 * the P06 onboarding "seen" flag pattern (see PROGRESS.md P06 decisions).
 * Exports: getLastUsedCategory, setLastUsedCategory
 * Spec: docs/spec/05a §5.4.1 ("nhớ danh mục dùng gần nhất")
 */
import type { TransactionType } from '@campuscoin/shared';

function storageKey(userId: string, type: TransactionType): string {
  return `cc.lastCategory.${userId}.${type}`;
}

/** Reads the last category id used for this user + transaction type, if any. */
export function getLastUsedCategory(userId: string, type: TransactionType): number | null {
  try {
    const raw = localStorage.getItem(storageKey(userId, type));
    const id = raw ? Number(raw) : NaN;
    return Number.isInteger(id) ? id : null;
  } catch {
    return null;
  }
}

/** Records the category id just used for this user + transaction type. */
export function setLastUsedCategory(userId: string, type: TransactionType, categoryId: number): void {
  try {
    localStorage.setItem(storageKey(userId, type), String(categoryId));
  } catch {
    // Best-effort convenience only — a blocked/full localStorage never breaks the save flow.
  }
}
