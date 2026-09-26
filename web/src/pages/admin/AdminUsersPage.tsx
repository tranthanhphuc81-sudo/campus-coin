import { useMemo, useState } from "react";

import { en } from "@/content/en";
import {
  useAdminDisableUser,
  useAdminEnableUser,
  useAdminSendReset,
  useAdminUsers,
} from "@/features/admin/hooks";

export default function AdminUsersPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const usersQuery = useAdminUsers(q, page, 10);
  const disableMutation = useAdminDisableUser();
  const enableMutation = useAdminEnableUser();
  const sendResetMutation = useAdminSendReset();

  const canPrev = page > 1;
  const canNext = useMemo(() => {
    if (!usersQuery.data) {
      return false;
    }
    return page < usersQuery.data.pagination.totalPages;
  }, [page, usersQuery.data]);

  return (
    <section className="admin-page">
      <header className="admin-page__header admin-page__header-row">
        <div>
          <h1>{en.admin.users.title}</h1>
          <p>{en.admin.users.subtitle}</p>
        </div>
        <input
          type="search"
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setPage(1);
          }}
          placeholder={en.admin.users.searchPlaceholder}
          aria-label={en.admin.users.searchPlaceholder}
        />
      </header>

      {usersQuery.isLoading ? <p>{en.common.loadingLabel}</p> : null}

      {usersQuery.data ? (
        <div className="panel admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{en.admin.users.columns.fullName}</th>
                <th>{en.admin.users.columns.email}</th>
                <th>{en.admin.users.columns.role}</th>
                <th>{en.admin.users.columns.status}</th>
                <th>{en.admin.users.columns.transactions}</th>
                <th>{en.admin.users.columns.actions}</th>
              </tr>
            </thead>
            <tbody>
              {usersQuery.data.data.map((user) => (
                <tr key={user.id}>
                  <td>{user.fullName}</td>
                  <td>{user.email}</td>
                  <td>{user.role}</td>
                  <td>{user.status}</td>
                  <td>{user.transactionCount}</td>
                  <td className="admin-table-actions">
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => {
                        if (user.status === "disabled") {
                          void enableMutation.mutateAsync(user.id);
                          return;
                        }
                        void disableMutation.mutateAsync(user.id);
                      }}
                    >
                      {user.status === "disabled"
                        ? en.admin.users.enableAction
                        : en.admin.users.disableAction}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => {
                        void sendResetMutation.mutateAsync(user.id);
                      }}
                    >
                      {en.admin.users.sendResetAction}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <footer className="admin-pagination">
            <button
              type="button"
              className="btn btn-outline"
              disabled={!canPrev}
              onClick={() => setPage((current) => current - 1)}
            >
              {en.admin.common.previousPage}
            </button>
            <span>
              {en.admin.common.pageLabel
                .replace("{page}", String(page))
                .replace("{totalPages}", String(usersQuery.data.pagination.totalPages))}
            </span>
            <button
              type="button"
              className="btn btn-outline"
              disabled={!canNext}
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
