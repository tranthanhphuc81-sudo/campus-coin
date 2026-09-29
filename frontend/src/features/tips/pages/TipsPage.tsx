/**
 * TipsPage.tsx
 * Student saving tips page (`/app/tips`, docs/spec/05b §5.10): the current period's ranked tips
 * (pinned first, as returned by the API — never re-sorted client-side), each with Save (bookmark,
 * P14), Pin/Unpin and Dismiss actions. A `?highlight=<tipId>` deep link (from `/app/saved`'s "Open"
 * action on a tip bookmark) highlights that card if it's in the current list.
 * Exports: default (TipsPage)
 * Spec: docs/spec/05b §5.10 · docs/spec/05c §5.12 (bookmarks)
 */
import { useSearchParams } from 'react-router';
import { CardSkeleton } from '../../../components/Skeletons';
import { EmptyState } from '../../../components/EmptyState';
import { ErrorState } from '../../../components/ErrorState';
import { PageHeader } from '../../../components/PageHeader';
import { useToast } from '../../../components/ToastProvider';
import { en } from '../../../i18n/en';
import { TipCard } from '../components/TipCard';
import { useDismissTipMutation, usePinTipMutation, useTipsQuery, useUnpinTipMutation } from '../hooks';

/** Saving tips page: list of the current period's tips with Save/Pin/Unpin/Dismiss actions. */
export default function TipsPage() {
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');
  const query = useTipsQuery();
  const pinMutation = usePinTipMutation();
  const unpinMutation = useUnpinTipMutation();
  const dismissMutation = useDismissTipMutation();
  const { showToast } = useToast();

  /** True while a pin/unpin/dismiss request for this specific tip is still in flight. */
  function isBusy(tipId: string): boolean {
    return (
      (pinMutation.isPending && pinMutation.variables === tipId) ||
      (unpinMutation.isPending && unpinMutation.variables === tipId) ||
      (dismissMutation.isPending && dismissMutation.variables === tipId)
    );
  }

  function handleDismiss(tipId: string) {
    dismissMutation.mutate(tipId, { onSuccess: () => showToast({ message: en.tips.dismissed }) });
  }

  return (
    <div>
      <PageHeader title={en.tips.title} subtitle={en.tips.subtitle} />

      {query.isLoading ? (
        <div className="d-flex flex-column gap-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : query.isError || !query.data ? (
        <ErrorState onRetry={() => void query.refetch()} />
      ) : query.data.data.length === 0 ? (
        <EmptyState icon="bi-piggy-bank" message={en.tips.empty} />
      ) : (
        <div>
          {query.data.data.map((tip) => (
            <TipCard
              key={tip.id}
              tip={tip}
              onPin={() => pinMutation.mutate(tip.id)}
              onUnpin={() => unpinMutation.mutate(tip.id)}
              onDismiss={() => handleDismiss(tip.id)}
              isBusy={isBusy(tip.id)}
              highlighted={tip.id === highlightId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
