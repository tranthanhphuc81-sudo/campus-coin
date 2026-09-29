/**
 * AdminUsersPage.tsx
 * Admin user management page (`/admin/users`): debounced search box, status filter, paginated
 * table, row click opens `AdminUserDetailDrawer`.
 * Exports: default (AdminUsersPage)
 * Spec: docs/spec/05c §5.13 · docs/spec/08 §8.3
 */
import { UserStatus, type ListAdminUsersQueryInput } from '@campuscoin/shared';
import { useState } from 'react';
import { EmptyState } from '../../../components/EmptyState';
import { ErrorState } from '../../../components/ErrorState';
import { PageHeader } from '../../../components/PageHeader';
import { TableSkeleton } from '../../../components/Skeletons';
import { en } from '../../../i18n/en';
import { formatDisplayDate } from '../../../lib/dates';
import { useDebouncedValue } from '../../../lib/useDebouncedValue';
import { AdminUserDetailDrawer } from '../components/AdminUserDetailDrawer';
import { useAdminUsersQuery } from '../hooks';

const SEARCH_DEBOUNCE_MS = 300;

type StatusFilter = UserStatus | 'all';

/** Badge variant/label for a user's status, mirroring the drawer's own mapping. */
function statusBadge(status: UserStatus): { variant: string; label: string } {
  if (status === UserStatus.ACTIVE) return { variant: 'success', label: en.adminUsers.statusActive };
  if (status === UserStatus.PENDING) return { variant: 'warning', label: en.adminUsers.statusPending };
  return { variant: 'secondary', label: en.adminUsers.statusDisabled };
}

/** Admin user management page: search, status filter, paginated table, detail drawer. */
export default function AdminUsersPage() {
  const t = en.adminUsers;
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [openUserId, setOpenUserId] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);

  const query: Partial<ListAdminUsersQueryInput> = {
    q: debouncedSearch.trim() || undefined,
    status: status === 'all' ? undefined : status,
    page,
  };
  const usersQuery = useAdminUsersQuery(query);
  const users = usersQuery.data?.data ?? [];
  const meta = usersQuery.data?.meta;
  const hasFilter = Boolean(debouncedSearch.trim() || status !== 'all');

  return (
    <>
      <PageHeader title={en.nav.adminUsers} />

      <div className="row g-2 mb-3">
        <div className="col-md-6">
          <label htmlFor="admin-users-search" className="form-label">
            {t.searchLabel}
          </label>
          <input
            id="admin-users-search"
            type="search"
            className="form-control"
            placeholder={t.searchPlaceholder}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="col-md-4">
          <label htmlFor="admin-users-status" className="form-label">
            {t.statusFilterLabel}
          </label>
          <select
            id="admin-users-status"
            className="form-select"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as StatusFilter);
              setPage(1);
            }}
          >
            <option value="all">{t.statusAll}</option>
            <option value={UserStatus.PENDING}>{t.statusPending}</option>
            <option value={UserStatus.ACTIVE}>{t.statusActive}</option>
            <option value={UserStatus.DISABLED}>{t.statusDisabled}</option>
          </select>
        </div>
      </div>

      {usersQuery.isLoading ? (
        <TableSkeleton rows={8} />
      ) : usersQuery.isError ? (
        <ErrorState message={t.loadError} onRetry={() => void usersQuery.refetch()} />
      ) : users.length === 0 ? (
        <EmptyState icon="bi-people" message={hasFilter ? t.noResults : t.empty} />
      ) : (
        <>
          <div className="table-responsive">
            <table className="table align-middle">
              <thead>
                <tr>
                  <th scope="col">{t.table.fullName}</th>
                  <th scope="col">{t.table.email}</th>
                  <th scope="col">{t.table.status}</th>
                  <th scope="col">{t.table.createdAt}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const badge = statusBadge(user.status);
                  return (
                    <tr key={user.id} role="button" onClick={() => setOpenUserId(user.id)} style={{ cursor: 'pointer' }}>
                      <td>{user.fullName}</td>
                      <td>{user.maskedEmail}</td>
                      <td>
                        <span className={`badge text-bg-${badge.variant}`}>{badge.label}</span>
                      </td>
                      <td>{formatDisplayDate(user.createdAt.slice(0, 10))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {meta && meta.totalPages > 1 ? (
            <nav className="d-flex justify-content-between align-items-center mt-3" aria-label={t.pagination.pageOf(meta.page, meta.totalPages)}>
              <button type="button" className="btn btn-outline-secondary btn-sm" disabled={meta.page <= 1} onClick={() => setPage(meta.page - 1)}>
                {t.pagination.previous}
              </button>
              <span className="small text-body-secondary">{t.pagination.pageOf(meta.page, meta.totalPages)}</span>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                disabled={meta.page >= meta.totalPages}
                onClick={() => setPage(meta.page + 1)}
              >
                {t.pagination.next}
              </button>
            </nav>
          ) : null}
        </>
      )}

      <AdminUserDetailDrawer userId={openUserId} onClose={() => setOpenUserId(null)} />
    </>
  );
}
