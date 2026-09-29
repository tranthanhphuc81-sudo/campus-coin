/**
 * MoneyText.tsx
 * Displays a money amount with an explicit +/− sign AND colour (never colour alone – WCAG,
 * spec §8.5) using `Intl.NumberFormat`. Display formatting only – arithmetic on money never
 * happens in JS (CLAUDE.md money invariant); `amount` is the exact decimal string from the API.
 * Exports: MoneyText, MoneyTextType
 * Spec: docs/spec/08 §8.5 (money formatting) · Rules: money invariant (CLAUDE.md)
 */
import { CurrencyCode, type CurrencyCode as CurrencyCodeType } from '@campuscoin/shared';

/** Direction hint for the sign + colour; omit for a plain (uncoloured) amount. */
export type MoneyTextType = 'income' | 'expense';

interface MoneyTextProps {
  /** Exact decimal string from the API, e.g. `"12.50"` – never a JS number. */
  amount: string;
  type?: MoneyTextType;
  currency?: CurrencyCodeType;
}

/** Formats a decimal money string as signed, coloured currency text (e.g. "+$12.50"). */
export function MoneyText({ amount, type, currency = CurrencyCode.USD }: MoneyTextProps) {
  const numeric = Number(amount);
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(numeric));

  const isZero = numeric === 0;
  // BUGFIX (found while live-verifying P09's Budgets/dashboard widgets, which are this
  // component's first "plain" (no `type`) callers for genuinely plain magnitudes like a budget
  // limit): `colorClass` already correctly falls back to no colour when `type` is omitted, but
  // `sign` didn't have the same fallback, so every untyped amount silently rendered a "+" — e.g.
  // "+$50.00" for a plain budget limit, contradicting this file's own doc ("omit for a plain
  // (uncoloured) amount").
  const sign = isZero || !type ? '' : type === 'expense' ? '−' : '+';
  const colorClass = isZero ? '' : type === 'income' ? 'text-bc-income' : type === 'expense' ? 'text-bc-expense' : '';

  return (
    <span className={`money${colorClass ? ` ${colorClass}` : ''}`}>
      {sign}
      {formatted}
    </span>
  );
}
