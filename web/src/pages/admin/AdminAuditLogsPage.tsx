import { useState } from "react";

import { en } from "@/content/en";
import { useAdminAuditLogs } from "@/features/admin/hooks";

export default function AdminAuditLogsPage() {
  const [actionFilter, setActionFilter] = useState("");
  const [page, setPage] = useState(1);

  const logsQuery = useAdminAuditLogs(actionFilter, page, 20);

  return (
    <section className="admin-page">
      <header className="admin-page__header admin-page__header-row">
        <div>
          <h1>{en.admin.auditLogs.title}</h1>
          <p>{en.admin.auditLogs.subtitle}</p>
        </div>
        <input
          type="search"
          value={actionFilter}
          onChange={(event) => {
            setActionFilter(event.target.value);
            setPage(1);
          }}
          placeholder={en.admin.auditLogs.filterPlaceholder}
          aria-label={en.admin.auditLogs.filterPlaceholder}
        />
      </header>

      {logsQuery.isLoading ? <p>{en.common.loadingLabel}</p> : null}

      {logsQuery.data ? (
        <div className="panel admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{en.admin.auditLogs.columns.time}</th>
                <th>{en.admin.auditLogs.columns.actor}</th>
                <th>{en.admin.auditLogs.columns.action}</th>
                <th>{en.admin.auditLogs.columns.entity}</th>
              </tr>
            </thead>
            <tbody>
              {logsQuery.data.data.map((item) => (
                <tr key={item.id}>
                  <td>{new Date(item.createdAt).toLocaleString()}</td>
                  <td>{item.actorRole}</td>
                  <td>{item.action}</td>
                  <td>
                    {item.entityType}
                    {item.entityId ? `:${item.entityId}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <footer className="admin-pagination">
            <button
              type="button"
              className="btn btn-outline"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              {en.admin.common.previousPage}
            </button>
            <span>
              {en.admin.common.pageLabel
                .replace("{page}", String(page))
                .replace("{totalPages}", String(logsQuery.data.pagination.totalPages))}
            </span>
            <button
              type="button"
              className="btn btn-outline"
              disabled={page >= logsQuery.data.pagination.totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              {en.admin.common.nextPage}
            </button>
          </footer>
        </div>
      ) : null}
    </section>
  );
}
