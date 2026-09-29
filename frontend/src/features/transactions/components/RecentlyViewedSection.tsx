/**
 * RecentlyViewedSection.tsx
 * Collapsible "Recently viewed" strip above the transactions list (P14, docs/spec/05c §5.14): up
 * to 8 most recently viewed/edited transactions; clicking one opens that transaction's detail
 * drawer via the same `onSelect` mechanism `TransactionsPage` already uses for its own rows.
 * Renders nothing once loaded with zero items, so it never clutters the page for a brand-new
 * account with no view history yet.
 * Exports: RecentlyViewedSection
 * Spec: docs/spec/05c §5.14
 */
import { useState } from 'react';
import Collapse from 'react-bootstrap/Collapse';
import { MoneyText } from '../../../components/MoneyText';
import { en } from '../../../i18n/en';
import { formatRelativeTime } from '../../../lib/dates';
import { useRecentActivityQuery } from '../../activity/hooks';

/** How many recently viewed/edited transactions to show in the strip. */
const RECENTLY_VIEWED_LIMIT = 8;

interface RecentlyViewedSectionProps {
  onSelect: (transactionId: string) => void;
}

/** Collapsible strip of the caller's most recently viewed/edited transactions. */
export function RecentlyViewedSection({ onSelect }: RecentlyViewedSectionProps) {
  const [open, setOpen] = useState(true);
  const query = useRecentActivityQuery(RECENTLY_VIEWED_LIMIT);
  const items = query.data ?? [];

  if (!query.isLoading && items.length === 0) return null;

  return (
    <div className="card mb-3">
      <button
        type="button"
        className="btn btn-link text-decoration-none w-100 text-start d-flex justify-content-between align-items-center card-body py-2"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="fw-semibold text-body">
          <i className="bi bi-clock-history me-2" aria-hidden="true" />
          {en.activity.title}
        </span>
        <i className={`bi bi-chevron-${open ? 'up' : 'down'} text-body-secondary`} aria-hidden="true" />
      </button>
      <Collapse in={open}>
        <div>
          <ul className="list-group list-group-flush">
            {items.map((item) => (
              <li key={item.transactionId} className="list-group-item p-0">
                <button
                  type="button"
                  className="btn btn-link text-decoration-none w-100 text-start d-flex justify-content-between align-items-center gap-2 px-3 py-2"
                  onClick={() => onSelect(item.transactionId)}
                >
                  <span className="text-body">
                    <span className="d-block">{item.description ?? en.transactions.table.noDescription}</span>
                    <small className="text-body-secondary">
                      {item.action === 'edited' ? en.activity.editedLabel : en.activity.viewedLabel} · {formatRelativeTime(item.occurredAt)}
                    </small>
                  </span>
                  <MoneyText amount={item.amount} type={item.type} currency={item.currency as 'USD' | 'VND'} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Collapse>
    </div>
  );
}
