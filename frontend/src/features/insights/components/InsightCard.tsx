/**
 * InsightCard.tsx
 * One month's card in the `InsightsPage` timeline: summary/tip prose, flagged-pattern chips, a
 * "Save" bookmark button (P14, ref = the insight's own month) and the Regenerate action. `highlighted`
 * (set when this card is the target of a `/app/saved` "Open" deep link, `?month=`) scrolls it into
 * view and gives it a visible border — a minimal, non-colour-only highlight.
 * Exports: InsightCard
 * Spec: docs/spec/05b §5.9 · docs/spec/05c §5.12 (bookmarks) · docs/spec/08 §8.5 (never convey info by colour alone)
 */
import { BookmarkTargetType, InsightGenerator, InsightStatus, type InsightDto, type InsightFlaggedPattern } from '@campuscoin/shared';
import { useEffect, useRef } from 'react';
import { en } from '../../../i18n/en';
import { formatMonthLabel } from '../../../lib/dates';
import { MoneyText } from '../../../components/MoneyText';
import { BookmarkButton } from '../../bookmarks/components/BookmarkButton';

interface InsightCardProps {
  insight: InsightDto;
  onRegenerate: () => void;
  isRegenerating: boolean;
  /** True when this card is the target of a `/app/saved` "Open" deep link. */
  highlighted?: boolean;
}

/** One flagged-spending-pattern chip. Growth chips carry a signed `%` prefix; every other kind shows category + amount — never colour alone (spec §8.5). */
function PatternChip({ pattern }: { pattern: InsightFlaggedPattern }) {
  const categoryName = pattern.categoryName ?? '';
  if (pattern.kind === 'growth' && pattern.growthPct !== null) {
    const isIncrease = pattern.growthPct >= 0;
    return (
      <span className={`badge rounded-pill ${isIncrease ? 'text-bg-warning' : 'text-bg-success'}`}>
        {en.insights.patterns.growth(categoryName, pattern.growthPct)}
      </span>
    );
  }
  if (pattern.kind === 'budget_exceeded') {
    return (
      <span className="badge rounded-pill text-bg-danger">
        {en.insights.patterns.budgetExceeded(categoryName)}
        {pattern.amount ? (
          <>
            {' '}
            <MoneyText amount={pattern.amount} />
          </>
        ) : null}
      </span>
    );
  }
  if (pattern.kind === 'new_category') {
    return (
      <span className="badge rounded-pill text-bg-info">
        {en.insights.patterns.newCategory(categoryName)}
        {pattern.amount ? (
          <>
            {' '}
            <MoneyText amount={pattern.amount} />
          </>
        ) : null}
      </span>
    );
  }
  return (
    <span className="badge rounded-pill text-bg-secondary">
      {en.insights.patterns.largestExpense(categoryName)}
      {pattern.amount ? (
        <>
          {' '}
          <MoneyText amount={pattern.amount} />
        </>
      ) : null}
    </span>
  );
}

/** One month's insight card: prose, flagged-pattern chips, generator label, Save and Regenerate buttons. */
export function InsightCard({ insight, onRegenerate, isRegenerating, highlighted }: InsightCardProps) {
  const generating = insight.status === InsightStatus.QUEUED || insight.status === InsightStatus.PROCESSING;
  const canRegenerate = insight.regenerateRemaining > 0 && !generating;
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlighted) cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlighted]);

  return (
    <div ref={cardRef} className={`card mb-3${highlighted ? ' border-primary border-2' : ''}`}>
      <div className="card-body">
        <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-2">
          <h2 className="h6 mb-0">{formatMonthLabel(insight.month)}</h2>
          <div className="d-flex gap-2">
            <BookmarkButton targetType={BookmarkTargetType.INSIGHT} targetRef={insight.month} />
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={onRegenerate}
              disabled={!canRegenerate || isRegenerating}
              title={insight.regenerateRemaining > 0 ? en.insights.regenerateRemaining(insight.regenerateRemaining) : en.insights.regenerateLimitReached}
            >
              <i className="bi bi-arrow-clockwise me-1" aria-hidden="true" />
              {isRegenerating ? en.insights.regenerating : en.insights.regenerate}
            </button>
          </div>
        </div>

        {generating ? (
          <p className="text-body-secondary mb-0" aria-live="polite">
            <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
            {en.insights.generating}
          </p>
        ) : (
          <>
            {insight.generator ? (
              <p className="small text-body-secondary mb-2">
                {insight.generator === InsightGenerator.LLM ? en.insights.generatorLlm : en.insights.generatorTemplate}
              </p>
            ) : null}
            {insight.summaryText ? <p>{insight.summaryText}</p> : null}
            {insight.tipText ? <p className="mb-2">{insight.tipText}</p> : null}
            {insight.savingsRatePct !== null ? (
              <p className="small fw-semibold mb-2">{en.insights.savingsRateLabel(insight.savingsRatePct)}</p>
            ) : null}
            {insight.flaggedPatterns.length > 0 ? (
              <div className="d-flex flex-wrap gap-2">
                {insight.flaggedPatterns.map((pattern, index) => (
                  // Patterns have no id of their own; kind+categoryId is stable within one card.
                  <PatternChip key={`${pattern.kind}-${pattern.categoryId ?? index}`} pattern={pattern} />
                ))}
              </div>
            ) : null}
          </>
        )}

        <p className="small text-body-secondary mb-0 mt-2">{en.insights.regenerateRemaining(insight.regenerateRemaining)}</p>
      </div>
    </div>
  );
}
