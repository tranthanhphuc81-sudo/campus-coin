/**
 * insight-output-validator.test.ts
 * Unit tests for `parseInsightOutput` (backend/src/integrations/ai/prompts/insight.v1.ts): the
 * numeric-grounding gate, banned-keyword filter and size limit that stand between a raw LLM reply
 * and a persisted insight.
 * Spec: docs/spec/05b §5.9.2 (insight prompt/output validation) · docs/spec/09 §9.9
 */
import { describe, expect, it } from 'vitest';
import { INSIGHT_OUTPUT_MAX_CHARS } from '@campuscoin/shared';
import { AiProviderError } from '../../../src/integrations/ai/errors.js';
import { parseInsightOutput } from '../../../src/integrations/ai/prompts/insight.v1.js';
import type { InsightStats } from '../../../src/integrations/ai/types.js';

/** A representative stats payload: one growth-flagged category, non-null savings rate. */
function baseStats(overrides: Partial<InsightStats> = {}): InsightStats {
  return {
    month: '2026-09-01',
    currency: 'USD',
    totalIncome: '500.00',
    totalExpense: '350.00',
    savingsRatePct: 30,
    flaggedPatterns: [{ kind: 'growth', categoryName: 'Food', amount: '150.00', avg3: '107.00', growthPct: 40.2, weeklyCap: '24.71' }],
    locale: 'en',
    ...overrides,
  };
}

describe('parseInsightOutput', () => {
  it('accepts output whose every number traces back to stats', () => {
    const stats = baseStats();
    const raw = {
      summary_text: 'You spent $350.00 out of $500.00 this month, saving 30%.',
      tip_text: 'Food rose 40% vs your $107.00 average; try capping it at $24.71/week.',
    };
    const result = parseInsightOutput(raw, stats);
    expect(result.summaryText).toContain('350.00');
    expect(result.tipText).toContain('24.71');
  });

  it('accepts a rounded variant of an allowed number (growthPct 40.2 -> "40%")', () => {
    const stats = baseStats();
    const raw = { summary_text: 'Food spending grew 40% this month.', tip_text: 'Keep an eye on it.' };
    expect(() => parseInsightOutput(raw, stats)).not.toThrow();
  });

  it('rejects a fabricated number that matches nothing in stats', () => {
    const stats = baseStats();
    const raw = { summary_text: 'You spent $999.99 this month.', tip_text: 'Nice job.' };
    expect(() => parseInsightOutput(raw, stats)).toThrow(AiProviderError);
  });

  it('rejects output that does not match the schema shape', () => {
    const stats = baseStats();
    expect(() => parseInsightOutput({ summary_text: 'ok' }, stats)).toThrow(AiProviderError);
    expect(() => parseInsightOutput('not json', stats)).toThrow(AiProviderError);
  });

  it('rejects output whose combined length exceeds INSIGHT_OUTPUT_MAX_CHARS', () => {
    const stats = baseStats();
    const half = Math.ceil(INSIGHT_OUTPUT_MAX_CHARS / 2) + 10;
    const raw = { summary_text: 'a'.repeat(half), tip_text: 'b'.repeat(half) };
    expect(() => parseInsightOutput(raw, stats)).toThrow(AiProviderError);
  });

  it('rejects output containing a URL/email/angle bracket (defense in depth)', () => {
    const stats = baseStats();
    expect(() => parseInsightOutput({ summary_text: 'Visit https://example.com for tips.', tip_text: 'ok' }, stats)).toThrow(AiProviderError);
    expect(() => parseInsightOutput({ summary_text: 'Email us at help@example.com.', tip_text: 'ok' }, stats)).toThrow(AiProviderError);
    expect(() => parseInsightOutput({ summary_text: 'Steady month <b>nice</b>.', tip_text: 'ok' }, stats)).toThrow(AiProviderError);
  });

  // C-L3: the URL/email checks above only catch an explicit `http(s)://`/`www.` prefix or an
  // @-address — a bare domain with neither (e.g. "evil-support.com") previously slipped through.
  // Uses a `.com` domain (not the finding's illustrative "evil-support.help") because the reused
  // pattern intentionally mirrors sanitize.ts's BARE_DOMAIN_PATTERN, whose TLD allow-list doesn't
  // include ".help".
  it('rejects output containing a bare domain with no protocol prefix (C-L3)', () => {
    const stats = baseStats();
    expect(() => parseInsightOutput({ summary_text: 'For more tips, visit evil-support.com today.', tip_text: 'ok' }, stats)).toThrow(
      AiProviderError,
    );
  });

  const bannedKeywordCases: Array<[string, string]> = [
    ['invest', 'Consider investing more next month.'],
    ['loan', 'You could get a loan next time.'],
    ['borrow', 'Try not to borrow money from friends.'],
    ['lend', 'Avoid lending money to friends.'],
    ['credit card', 'Pay off your credit card balance.'],
    ['payday', 'Wait for payday before spending.'],
    ['crypto', 'Avoid cryptocurrency purchases.'],
    ['bitcoin', 'Bitcoin purchases were flagged.'],
    ['stock market', 'The stock market is risky.'],
    ['shares', 'Buying shares is risky.'],
    ['trading', 'Day trading can be risky.'],
    ['forex', 'Forex speculation is risky.'],
    ['gambling', 'Avoid gambling apps.'],
    ['betting', 'Sports betting is discouraged.'],
    ['lottery', 'Skip the lottery this month.'],
    ['mortgage', 'Save for a future mortgage.'],
    ['interest rate', 'Watch the interest rate rise.'],
  ];

  it.each(bannedKeywordCases)('rejects banned keyword family: %s', (_name, sentence) => {
    const stats = baseStats();
    expect(() => parseInsightOutput({ summary_text: sentence, tip_text: 'Keep it up.' }, stats)).toThrow(AiProviderError);
  });
});
