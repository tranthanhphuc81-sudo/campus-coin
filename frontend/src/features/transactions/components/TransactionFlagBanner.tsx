/**
 * TransactionFlagBanner.tsx
 * Interactive anomaly/possible-duplicate banner shown in `TransactionDetailDrawer` (P14, docs/spec
 * /05c §5.14): one `alert-warning` per active flag, each with "Keep" (clears the flag) and
 * "Delete" (soft-deletes the transaction) actions, wired to `POST /transactions/:id/resolve-flag`.
 * The transactions LIST keeps its own display-only badges (P08) unchanged — only the drawer gets
 * this interactive version.
 * Exports: TransactionFlagBanner
 * Spec: docs/spec/05c §5.14
 */
import type { TransactionDto } from '@campuscoin/shared';
import { useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Spinner from 'react-bootstrap/Spinner';
import { useToast } from '../../../components/ToastProvider';
import { en } from '../../../i18n/en';
import { useResolveFlagMutation } from '../hooks';

interface TransactionFlagBannerProps {
  transaction: TransactionDto;
  /** Called once a "Delete" action succeeds, so the drawer closes (the transaction is now gone). */
  onDeleted: () => void;
}

type Flag = 'anomaly' | 'duplicate';

/** One flag's alert: message + Keep/Delete buttons, disabled while its own request is in flight. */
function FlagAlert({
  flag,
  message,
  deleteLabel,
  isBusy,
  onResolve,
}: {
  flag: Flag;
  message: string;
  deleteLabel: string;
  isBusy: boolean;
  onResolve: (flag: Flag, action: 'keep' | 'delete') => void;
}) {
  return (
    <Alert variant="warning" className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
      <span>{message}</span>
      <div className="d-flex gap-2 flex-shrink-0">
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onResolve(flag, 'keep')} disabled={isBusy}>
          {isBusy ? <Spinner animation="border" size="sm" aria-hidden="true" /> : en.transactions.flags.keep}
        </button>
        <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => onResolve(flag, 'delete')} disabled={isBusy}>
          {deleteLabel}
        </button>
      </div>
    </Alert>
  );
}

/** Renders an interactive Keep/Delete banner for each of `transaction`'s active anomaly/duplicate flags. */
export function TransactionFlagBanner({ transaction, onDeleted }: TransactionFlagBannerProps) {
  const { showToast } = useToast();
  const resolveFlagMutation = useResolveFlagMutation();
  const [pendingFlag, setPendingFlag] = useState<Flag | null>(null);

  function resolve(flag: Flag, action: 'keep' | 'delete') {
    setPendingFlag(flag);
    resolveFlagMutation.mutate(
      { id: transaction.id, input: { flag, action } },
      {
        onSuccess: () => {
          if (action === 'delete') {
            showToast({ message: en.transactions.flags.deleted });
            onDeleted();
          } else {
            showToast({ message: en.transactions.flags.kept });
          }
        },
        onSettled: () => setPendingFlag(null),
      },
    );
  }

  if (!transaction.isPossibleDuplicate && !transaction.isAnomaly) return null;

  return (
    <div>
      {transaction.isPossibleDuplicate ? (
        <FlagAlert
          flag="duplicate"
          message={en.transactions.flags.duplicateMessage}
          deleteLabel={en.transactions.flags.deleteDuplicate}
          isBusy={pendingFlag === 'duplicate' && resolveFlagMutation.isPending}
          onResolve={resolve}
        />
      ) : null}
      {transaction.isAnomaly ? (
        <FlagAlert
          flag="anomaly"
          message={en.transactions.flags.anomalyMessage}
          deleteLabel={en.transactions.flags.delete}
          isBusy={pendingFlag === 'anomaly' && resolveFlagMutation.isPending}
          onResolve={resolve}
        />
      ) : null}
    </div>
  );
}
