/**
 * InsightsPage.tsx
 * Student monthly AI insights page (`/app/insights`, docs/spec/05b §5.9): a timeline of insight
 * cards, newest month first, each with its own Save (bookmark) and Regenerate actions. A single
 * `useInsightsListQuery` drives the whole page (rather than one `useInsightByMonthQuery` per card),
 * and the list query already polls itself while any card is `queued`/`processing` (see hooks.ts).
 * A `?month=` deep link (from `/app/saved`'s "Open" action on an insight bookmark, P14) highlights
 * that month's card, fetching it separately via `useInsightByMonthQuery` only if it fell outside
 * the timeline's own default page.
 * Exports: default (InsightsPage)
 * Spec: docs/spec/05b §5.9 · docs/spec/05c §5.12 (bookmarks)
 */
import type { InsightDto } from '@campuscoin/shared';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { CardSkeleton } from '../../../components/Skeletons';
import { EmptyState } from '../../../components/EmptyState';
import { ErrorState } from '../../../components/ErrorState';
import { PageHeader } from '../../../components/PageHeader';
import { en } from '../../../i18n/en';
import { InsightCard } from '../components/InsightCard';
import { useInsightByMonthQuery, useInsightsListQuery, useRegenerateInsightMutation } from '../hooks';

const INSIGHT_HISTORY_PAGE_SIZE = 12;

/** Monthly AI insights page: a timeline of past insight cards with Save/Regenerate actions each. */
export default function InsightsPage() {
  const [searchParams] = useSearchParams();
  const highlightMonth = searchParams.get('month');
  const query = useInsightsListQuery({ page: 1, limit: INSIGHT_HISTORY_PAGE_SIZE });
  const regenerateMutation = useRegenerateInsightMutation();
  // Tracks which month's Regenerate button is mid-flight, so only that card shows a busy state.
  const [regeneratingMonth, setRegeneratingMonth] = useState<string | null>(null);

  const timeline = query.data?.data ?? [];
  const isHighlightInTimeline = Boolean(highlightMonth) && timeline.some((insight) => insight.month === highlightMonth);
  // Only fetch the highlighted month separately once the timeline itself has loaded and doesn't
  // already contain it — avoids a wasted request for the common case (a recent month's bookmark).
  const highlightQuery = useInsightByMonthQuery(highlightMonth ?? '', Boolean(highlightMonth) && !query.isLoading && !isHighlightInTimeline);

  function handleRegenerate(month: string) {
    setRegeneratingMonth(month);
    regenerateMutation.mutate(month, { onSettled: () => setRegeneratingMonth(null) });
  }

  if (query.isLoading) {
    return (
      <div>
        <PageHeader title={en.insights.title} subtitle={en.insights.subtitle} />
        <div className="d-flex flex-column gap-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div>
        <PageHeader title={en.insights.title} subtitle={en.insights.subtitle} />
        <ErrorState onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const extraInsight: InsightDto | null = !isHighlightInTimeline && highlightQuery.data ? highlightQuery.data : null;
  const insights = extraInsight ? [extraInsight, ...timeline] : timeline;

  return (
    <div>
      <PageHeader title={en.insights.title} subtitle={en.insights.subtitle} />

      {insights.length === 0 ? (
        <EmptyState icon="bi-stars" message={en.insights.empty} />
      ) : (
        <div>
          {insights.map((insight) => (
            <InsightCard
              key={insight.month}
              insight={insight}
              onRegenerate={() => handleRegenerate(insight.month)}
              isRegenerating={regeneratingMonth === insight.month && regenerateMutation.isPending}
              highlighted={insight.month === highlightMonth}
            />
          ))}
        </div>
      )}
    </div>
  );
}
