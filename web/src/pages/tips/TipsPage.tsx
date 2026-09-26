import { en } from "@/content/en";
import BookmarkButton from "@/components/bookmarks/BookmarkButton";
import {
  useDismissTip,
  usePinTip,
  useTips,
  useUnpinTip,
  type TipItem,
} from "@/features/tips/hooks";
import { formatMoney } from "@/lib/money";
import { parseProblem } from "@/lib/problem";

function TipActions({ tip }: { tip: TipItem }) {
  const pinMutation = usePinTip();
  const unpinMutation = useUnpinTip();
  const dismissMutation = useDismissTip();

  const isBusy = pinMutation.isPending || unpinMutation.isPending || dismissMutation.isPending;

  return (
    <div className="tips-card__actions">
      {tip.status === "pinned" ? (
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => {
            void unpinMutation.mutateAsync(tip.id);
          }}
          disabled={isBusy}
        >
          {en.tips.actions.unpin}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => {
            void pinMutation.mutateAsync(tip.id);
          }}
          disabled={isBusy}
        >
          {en.tips.actions.pin}
        </button>
      )}

      <button
        type="button"
        className="btn btn-outline"
        onClick={() => {
          void dismissMutation.mutateAsync(tip.id);
        }}
        disabled={isBusy}
      >
        {en.tips.actions.dismiss}
      </button>
    </div>
  );
}

export default function TipsPage() {
  const tipsQuery = useTips();

  if (tipsQuery.isLoading) {
    return <p>{en.common.loadingLabel}</p>;
  }

  if (tipsQuery.isError) {
    const problem = parseProblem(tipsQuery.error);
    return <p>{problem.detail || en.common.genericErrorDetail}</p>;
  }

  const data = tipsQuery.data;

  return (
    <section className="tips-page" aria-labelledby="tips-page-title">
      <header className="tips-page__header">
        <h1 id="tips-page-title">{en.tips.title}</h1>
        <p>{en.tips.subtitle}</p>
      </header>

      {data && data.tips.length === 0 ? <p>{en.tips.emptyState}</p> : null}

      <div className="tips-grid">
        {(data?.tips ?? []).map((tip) => (
          <article key={tip.id} className="panel tips-card">
            <header className="tips-card__header">
              <h2>{tip.title}</h2>
              {tip.status === "pinned" ? (
                <span className="tips-card__badge">{en.tips.pinnedBadge}</span>
              ) : null}
            </header>
            <p>{tip.body}</p>
            <p className="dashboard-widget__meta">
              {en.tips.impactLabel}: {formatMoney(tip.impactAmount)}
            </p>
            <TipActions tip={tip} />
            <BookmarkButton targetType="tip" targetRef={tip.id} />
          </article>
        ))}
      </div>
    </section>
  );
}
