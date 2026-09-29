/**
 * budgetStatus.test.ts
 * Verifies the server-computed `BudgetStatus` enum maps to the expected Bootstrap/text classes
 * and labels — this module never recomputes the traffic-light thresholds itself.
 */
import { describe, expect, it } from 'vitest';
import { budgetStatusLabel, budgetStatusProgressClass, budgetStatusTextClass } from './budgetStatus';

describe('budgetStatus mapping', () => {
  it('maps green to the success/income classes and label', () => {
    expect(budgetStatusProgressClass('green')).toBe('bg-success');
    expect(budgetStatusTextClass('green')).toBe('text-bc-income');
    expect(budgetStatusLabel('green')).toBe('On track');
  });

  it('maps amber to the warning classes and label', () => {
    expect(budgetStatusProgressClass('amber')).toBe('bg-warning');
    expect(budgetStatusTextClass('amber')).toBe('text-bc-warning-budget');
    expect(budgetStatusLabel('amber')).toBe('Near limit');
  });

  it('maps red to the danger/expense classes and label', () => {
    expect(budgetStatusProgressClass('red')).toBe('bg-danger');
    expect(budgetStatusTextClass('red')).toBe('text-bc-expense');
    expect(budgetStatusLabel('red')).toBe('Over budget');
  });
});
