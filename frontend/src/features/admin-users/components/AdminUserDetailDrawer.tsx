/**
 * AdminUserDetailDrawer.tsx
 * Right-side drawer opened from a row in `AdminUsersPage`'s table: shows `GET /admin/users/:id`'s
 * full detail (name, full email, status, createdAt, lastLoginAt, transaction COUNT only — never a
 * transactions list, per CLAUDE.md: admin never reads a student's financial detail) plus 3 actions.
 * Disable/Enable go through a `ConfirmModal`; Send reset link fires immediately (the backend never
 * leaks whether the target account was actually active, spec §8.3).
 * Exports: AdminUserDetailDrawer
 * Spec: docs/spec/05c §5.13 · docs/spec/08 §8.3
 */
import { UserStatus } from '@campuscoin/shared';
import { useState } from 'react';
import Offcanvas from 'react-bootstrap/Offcanvas';
import { ConfirmModal } from '../../../components/ConfirmModal';
import { ErrorState } from '../../../components/ErrorState';
import { TableSkeleton } from '../../../components/Skeletons';
import { useToast } from '../../../components/ToastProvider';
import { en } from '../../../i18n/en';
import { formatDateTime } from '../../../lib/dates';
import { useAdminUserQuery, useDisableAdminUserMutation, useEnableAdminUserMutation, useSendResetLinkMutation } from '../hooks';

interface AdminUserDetailDrawerProps {
  userId: string | null;
  onClose: () => void;
}

/** Detail drawer for a single admin-managed user, opened by clicking a row in `AdminUsersPage`. */
export function AdminUserDetailDrawer({ userId, onClose }: AdminUserDetailDrawerProps) {
  const t = en.adminUsers.detail;
  const { showToast } = useToast();
  const [confirmAction, setConfirmAction] = useState<'disable' | 'enable' | null>(null);
  const userQuery = useAdminUserQuery(userId);
  const disableMutation = useDisableAdminUserMutation();
  const enableMutation = useEnableAdminUserMutation();
  const sendResetMutation = useSendResetLinkMutation();

  function handleDisable() {
    if (!userId) return;
    disableMutation.mutate(userId, {
      onSuccess: () => {
        showToast({ message: t.disabled });
        setConfirmAction(null);
      },
    });
  }

  function handleEnable() {
    if (!userId) return;
    enableMutation.mutate(userId, {
      onSuccess: () => {
        showToast({ message: t.enabled });
        setConfirmAction(null);
      },
    });
  }

  function handleSendReset() {
    if (!userId) return;
    // BR: the response is always 202 regardless of outcome, so the toast never implies anything
    // about whether the target account exists/is active.
    sendResetMutation.mutate(userId, { onSuccess: () => showToast({ message: t.resetSent }) });
  }

  const user = userQuery.data;

  return (
    <>
      <Offcanvas show={userId !== null} onHide={onClose} placement="end">
        <Offcanvas.Header closeButton>
          <Offcanvas.Title as="h2" className="h5 mb-0">
            {t.title}
          </Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body>
          {userQuery.isLoading ? (
            <TableSkeleton rows={5} />
          ) : userQuery.isError ? (
            <ErrorState message={t.loadError} onRetry={() => void userQuery.refetch()} />
          ) : user ? (
            <>
              <dl className="row mb-4">
                <dt className="col-5">{t.fullName}</dt>
                <dd className="col-7">{user.fullName}</dd>
                <dt className="col-5">{t.email}</dt>
                <dd className="col-7">{user.email}</dd>
                <dt className="col-5">{t.status}</dt>
                <dd className="col-7">
                  <span
                    className={`badge text-bg-${user.status === UserStatus.ACTIVE ? 'success' : user.status === UserStatus.PENDING ? 'warning' : 'secondary'}`}
                  >
                    {user.status === UserStatus.ACTIVE ? en.adminUsers.statusActive : user.status === UserStatus.PENDING ? en.adminUsers.statusPending : en.adminUsers.statusDisabled}
                  </span>
                </dd>
                <dt className="col-5">{t.createdAt}</dt>
                <dd className="col-7">{formatDateTime(user.createdAt)}</dd>
                <dt className="col-5">{t.lastLoginAt}</dt>
                <dd className="col-7">{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : t.neverLoggedIn}</dd>
                <dt className="col-5">{t.transactionCount}</dt>
                <dd className="col-7">{user.transactionCount.toLocaleString('en-US')}</dd>
              </dl>

              <div className="d-flex flex-column gap-2">
                {user.status !== UserStatus.DISABLED ? (
                  <button type="button" className="btn btn-outline-danger" onClick={() => setConfirmAction('disable')}>
                    {t.disable}
                  </button>
                ) : null}
                {user.status === UserStatus.DISABLED ? (
                  <button type="button" className="btn btn-outline-primary" onClick={() => setConfirmAction('enable')}>
                    {t.enable}
                  </button>
                ) : null}
                <button type="button" className="btn btn-outline-secondary" disabled={sendResetMutation.isPending} onClick={handleSendReset}>
                  {t.sendReset}
                </button>
              </div>
            </>
          ) : null}
        </Offcanvas.Body>
      </Offcanvas>

      <ConfirmModal
        show={confirmAction === 'disable'}
        title={t.disableConfirmTitle}
        body={t.disableConfirmBody}
        variant="danger"
        confirmLabel={t.disable}
        onCancel={() => setConfirmAction(null)}
        onConfirm={handleDisable}
      />
      <ConfirmModal
        show={confirmAction === 'enable'}
        title={t.enableConfirmTitle}
        body={t.enableConfirmBody}
        variant="primary"
        confirmLabel={t.enable}
        onCancel={() => setConfirmAction(null)}
        onConfirm={handleEnable}
      />
    </>
  );
}
