/**
 * MoneyText.test.tsx
 * Verifies formatting, sign and colour class for income/expense/zero amounts, and currency
 * switching (USD/VND).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CurrencyCode } from '@campuscoin/shared';
import { MoneyText } from './MoneyText';

describe('MoneyText', () => {
  it('renders an income amount with a + sign and the income colour class', () => {
    render(<MoneyText amount="12.50" type="income" />);
    const el = screen.getByText('+$12.50');
    expect(el).toHaveClass('text-bc-income');
    expect(el).toHaveClass('money');
  });

  it('renders an expense amount with a minus sign and the expense colour class', () => {
    render(<MoneyText amount="12.50" type="expense" />);
    const el = screen.getByText('−$12.50');
    expect(el).toHaveClass('text-bc-expense');
  });

  it('renders a zero amount with no sign and no colour class', () => {
    render(<MoneyText amount="0" type="income" />);
    const el = screen.getByText('$0.00');
    expect(el).not.toHaveClass('text-bc-income');
    expect(el).not.toHaveClass('text-bc-expense');
  });

  it('formats VND amounts using the given currency', () => {
    render(<MoneyText amount="500000" type="expense" currency={CurrencyCode.VND} />);
    expect(screen.getByText(/^−.*500,000/)).toBeInTheDocument();
  });

  it('renders a plain (untyped) amount with no sign and no colour class', () => {
    render(<MoneyText amount="50.00" />);
    const el = screen.getByText('$50.00');
    expect(el).not.toHaveClass('text-bc-income');
    expect(el).not.toHaveClass('text-bc-expense');
  });
});
