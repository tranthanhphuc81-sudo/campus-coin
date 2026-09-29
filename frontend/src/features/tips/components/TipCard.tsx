/**
 * TipCard.tsx
 * One tip's card in `TipsPage`: title/body, impact chip, a Save (bookmark, P14) button, Pin/Unpin
 * toggle and Dismiss. Kept separate from the dashboard's `TipsCard` widget, which reads a different
 * (simpler) `DashboardTipSummary` shape — this component is `TipDto`-only. `highlighted` (set when
 * this card is the target of a `/app/saved` "Open" deep link, `?highlight=`) scrolls it into view
 * and gives it a visible border — a minimal, non-colour-only highlight.
 * Exports: TipCard
 * Spec: docs/spec/05b §5.10 · docs/spec/05c §5.12 (bookmarks)
 */
import { BookmarkTargetType, UserTipStatus, type TipDto } from '@campuscoin/shared';
import { useEffect, useRef } from 'react';
import { MoneyText } from '../../../components/MoneyText';
import { en } from '../../../i18n/en';
import { BookmarkButton } from '../../bookmarks/components/BookmarkButton';

interface TipCardProps {
  tip: TipDto;
  onPin: () => void;
  onUnpin: () => void;
  onDismiss: () => void;
  /** Disables all three actions while a pin/unpin/dismiss request for this specific tip is in flight. */
  isBusy: boolean;
  /** True when this card is the target of a `/app/saved` "Open" deep link. */
  highlighted?: boolean;
}

/** One savings tip: title/body/impact plus Save, Pin-or-Unpin and Dismiss actions. */
export function TipCard({ tip, onPin, onUnpin, onDismiss, isBusy, highlighted }: TipCardProps) {
  const isPinned = tip.status === UserTipStatus.PINNED;
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlighted) cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlighted]);

  return (
    <div ref={cardRef} className={`card mb-3${highlighted ? ' border-primary border-2' : ''}`}>
      <div className="card-body d-flex flex-wrap justify-content-between gap-3">
        <div>
          <div className="d-flex align-items-center gap-2 mb-1">
            <h2 className="h6 mb-0">{tip.title}</h2>
            {isPinned ? <span className="badge text-bg-primary">{en.tips.pinnedBadge}</span> : null}
          </div>
          <p className="mb-2">{tip.body}</p>
          <p className="small text-body-secondary mb-0">
            {en.tips.impactLabel}: <MoneyText amount={tip.impactAmount} />
          </p>
        </div>
        <div className="d-flex flex-column gap-2 flex-shrink-0">
          <BookmarkButton targetType={BookmarkTargetType.TIP} targetRef={tip.id} />
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={isPinned ? onUnpin : onPin}
            disabled={isBusy}
            aria-pressed={isPinned}
          >
            <i className={`bi ${isPinned ? 'bi-pin-angle-fill' : 'bi-pin-angle'} me-1`} aria-hidden="true" />
            {isPinned ? en.tips.unpin : en.tips.pin}
          </button>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onDismiss} disabled={isBusy}>
            <i className="bi bi-x-lg me-1" aria-hidden="true" />
            {en.tips.dismiss}
          </button>
        </div>
      </div>
    </div>
  );
}
