/**
 * AdminAuditLogPage.tsx
 * Read-only admin audit-log viewer (`/admin/audit-log`): filters (action, actor id, date range),
 * paginated table. No create/edit/delete UI at all.
 * Exports: default (AdminAuditLogPage)
 * Spec: docs/spec/09 §9.12 · docs/spec/08 §8.3
 */
import type { AdminAuditLogQueryInput } from '@campuscoin/shared';
import { useState } from 'react';
import { EmptyState } from '../../../components/EmptyState';
import { ErrorState } from '../../../components/ErrorState';
import { PageHeader } from '../../../components/PageHeader';
import { TableSkeleton } from '../../../components/Skeletons';
import { en } from '../../../i18n/en';
import { formatDateTime } from '../../../lib/dates';
import { useAdminAuditLogsQuery } from '../hooks';

/** Converts a `date` input value (`YYYY-MM-DD`) to an ISO instant at the start of that local day. */
function dateInputToIsoStart(value: string): string {
  return new Date(`${value}T00:00:00`).toISOString();
}

/** Converts a `date` input value (`YYYY-MM-DD`) to an ISO instant at the end of that local day. */
function dateInputToIsoEnd(value: string): string {
  return new Date(`${value}T23:59:59.999`).toISOString();
}

/** Truncates a long string to `max` characters, appending an ellipsis (full value kept in `title`). */
function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

const USER_AGENT_TRUNCATE_LENGTH = 40;
const IP_HASH_PREFIX_LENGTH = 12;

/** Read-only admin audit-log viewer: filters + paginated table. */
export default function AdminAuditLogPage() {
  const t = en.adminAuditLog;
  const [action, setAction] = useState('');
  const [actorId, setActorId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const query: Partial<AdminAuditLogQueryInput> = {
    action: action.trim() || undefined,
    actorId: actorId.trim() || undefined,
    from: from ? dateInputToIsoStart(from) : undefined,
    to: to ? dateInputToIsoEnd(to) : undefined,
    page,
  };
  const logsQuery = useAdminAuditLogsQuery(query);
  const logs = logsQuery.data?.data ?? [];
  const meta = logsQuery.data?.meta;
  const hasFilter = Boolean(action.trim() || actorId.trim() || from || to);

  function handleClearFilters() {
    setAction('');
    setActorId('');
    setFrom('');
    setTo('');
    setPage(1);
  }

  return (
    <>
      <PageHeader title={en.nav.adminAuditLog} />

      <div className="row g-2 mb-3 align-items-end">
        <div className="col-sm-6 col-md-3">
          <label htmlFor="audit-filter-action" className="form-label">
            {t.filters.action}
          </label>
          <input
            id="audit-filter-action"
            type="text"
            className="form-control"
            placeholder={t.filters.actionPlaceholder}
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="col-sm-6 col-md-3">
          <label htmlFor="audit-filter-actor" className="form-label">
            {t.filters.actorId}
          </label>
          <input
            id="audit-filter-actor"
            type="text"
            className="form-control"
            value={actorId}
            onChange={(e) => {
              setActorId(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="col-sm-6 col-md-2">
          <label htmlFor="audit-filter-from" className="form-label">
            {t.filters.from}
          </label>
          <input
            id="audit-filter-from"
            type="date"
            className="form-control"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="col-sm-6 col-md-2">
          <label htmlFor="audit-filter-to" className="form-label">
            {t.filters.to}
          </label>
          <input
            id="audit-filter-to"
            type="date"
            className="form-control"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="col-sm-6 col-md-2">
          <button type="button" className="btn btn-outline-secondary w-100" onClick={handleClearFilters}>
            {t.filters.clear}
          </button>
        </div>
      </div>

      {logsQuery.isLoading ? (
        <TableSkeleton rows={10} />
      ) : logsQuery.isError ? (
        <ErrorState message={t.loadError} onRetry={() => void logsQuery.refetch()} />
      ) : logs.length === 0 ? (
        <EmptyState icon="bi-journal-text" message={hasFilter ? t.noResults : t.empty} />
      ) : (
        <>
          <div className="table-responsive">
            <table className="table table-sm align-middle">
              <thead>
                <tr>
                  <th scope="col">{t.table.createdAt}</th>
                  <th scope="col">{t.table.action}</th>
                  <th scope="col">{t.table.actorId}</th>
                  <th scope="col">{t.table.actorRole}</th>
                  <th scope="col">{t.table.entity}</th>
                  <th scope="col">{t.table.ipHash}</th>
                  <th scope="col">{t.table.userAgent}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDateTime(entry.createdAt)}</td>
                    <td className="font-monospace">{entry.action}</td>
                    <td>{entry.actorId ?? t.systemActor}</td>
                    <td>{entry.actorRole ?? t.none}</td>
                    <td>
                      {entry.entityType ? `${entry.entityType}${entry.entityId ? ` #${entry.entityId}` : ''}` : t.none}
                    </td>
                    <td className="font-monospace">{entry.ipHash ? entry.ipHash.slice(0, IP_HASH_PREFIX_LENGTH) : t.none}</td>
                    <td title={entry.userAgent ?? undefined}>{entry.userAgent ? truncate(entry.userAgent, USER_AGENT_TRUNCATE_LENGTH) : t.none}</td>
                  </tr>
                ))}
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
    </>
  );
}
