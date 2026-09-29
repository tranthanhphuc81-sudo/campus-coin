/**
 * budgets.mapper.test.ts
 * Unit tests for the pure budget consumption status calculation (green/amber/red boundaries).
 * Spec: docs/spec/05b §5.7 Bảng 21 (status thresholds) · docs/spec/12 (testing plan)
 */
import { describe, expect, it } from 'vitest';
import { BudgetStatus } from '@campuscoin/shared';
import { statusForPercent } from '../../../src/modules/budgets/budgets.mapper.js';

describe('statusForPercent', () => {
  it('is green below 80%', () => {
    expect(statusForPercent(0)).toBe(BudgetStatus.GREEN);
    expect(statusForPercent(79)).toBe(BudgetStatus.GREEN);
  });

  it('is amber from 80% up to (not including) 100%', () => {
    expect(statusForPercent(80)).toBe(BudgetStatus.AMBER);
    expect(statusForPercent(99)).toBe(BudgetStatus.AMBER);
  });

  it('is red at 100% and above', () => {
    expect(statusForPercent(100)).toBe(BudgetStatus.RED);
    expect(statusForPercent(101)).toBe(BudgetStatus.RED);
    expect(statusForPercent(250)).toBe(BudgetStatus.RED);
  });
});
