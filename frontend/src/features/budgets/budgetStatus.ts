/**
 * budgetStatus.ts
 * Maps a server-computed `BudgetStatus` ('green'|'amber'|'red') to the Bootstrap classes used by
 * the progress bar and its text badge. The percent/status themselves are always computed
 * server-side (`BudgetDto.status`) — this module only maps the enum to presentation, it never
 * recomputes the traffic-light thresholds client-side.
 * Exports: budgetStatusProgressClass, budgetStatusTextClass, budgetStatusLabel
 * Spec: docs/spec/05b §5.7 Bảng 21 (green <80% / amber 80-99% / red >=100%) · docs/spec/08 §8.5
 *   (never convey status by colour alone — every bar is paired with a text label)
 */
import type { BudgetStatus } from '@campuscoin/shared';
import { en } from '../../i18n/en';

/** Bootstrap `.progress-bar` background class for a budget's traffic-light status. */
export function budgetStatusProgressClass(status: BudgetStatus): string {
  switch (status) {
    case 'red':
      return 'bg-danger';
    case 'amber':
      return 'bg-warning';
    default:
      return 'bg-success';
  }
}

/**
 * Text-colour class matching {@link budgetStatusProgressClass}, for the status label. Reuses the
 * app's own contrast-checked `--bc-income`/`--bc-expense`/`--bc-warning-budget` tokens (same hues
 * as the progress bar) rather than Bootstrap's default `text-*` utilities.
 */
export function budgetStatusTextClass(status: BudgetStatus): string {
  switch (status) {
    case 'red':
      return 'text-bc-expense';
    case 'amber':
      return 'text-bc-warning-budget';
    default:
      return 'text-bc-income';
  }
}

/** Human-readable label for a budget's status (never rely on colour alone — spec §8.5). */
export function budgetStatusLabel(status: BudgetStatus): string {
  return en.budgets.status[status];
}
