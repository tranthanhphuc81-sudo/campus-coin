/**
 * r0.ts
 * R0 general (docs/spec/05b §5.10 Bảng 23): always-eligible fallback tip, independent of any user
 * statistics. Its fixed score (`TIP_GENERAL_FIXED_SCORE`) is applied by the caller
 * (`tips.service.ts`), not here — this function only signals "always eligible, zero impact".
 * Main exports: r0General
 * Spec: docs/spec/05b §5.10 Bảng 23 (R0)
 */
import { TipRuleType } from '@campuscoin/shared';
import { Decimal } from '../../../lib/money.js';
import type { TipCandidate } from '../tips.types.js';

/** Always returns exactly one candidate: a general savings tip. */
export function r0General(): TipCandidate[] {
  return [{ ruleType: TipRuleType.GENERAL, categoryId: null, categoryName: null, impact: new Decimal(0), vars: {} }];
}
