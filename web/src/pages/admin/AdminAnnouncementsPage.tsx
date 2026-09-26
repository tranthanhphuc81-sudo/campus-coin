import { useState } from "react";

import { en } from "@/content/en";
import {
  useAdminAnnouncements,
  useCreateAdminAnnouncement,
  useDeleteAdminAnnouncement,
  usePreviewAnnouncement,
} from "@/features/admin/hooks";

export default function AdminAnnouncementsPage() {
  const announcementsQuery = useAdminAnnouncements();
  const createMutation = useCreateAdminAnnouncement();
  const deleteMutation = useDeleteAdminAnnouncement();
  const previewMutation = usePreviewAnnouncement();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [startsAt, setStartsAt] = useState("2026-09-01");

  const createAnnouncement = async () => {
    if (!title.trim() || !body.trim()) {
      return;
    }

    await createMutation.mutateAsync({
      title: title.trim(),
      body: body.trim(),
      level: "info",
      startsAt,
      endsAt: null,
      isActive: true,
    });

    setTitle("");
    setBody("");
  };

  return (
    <section className="admin-page">
      <header className="admin-page__header">
        <h1>{en.admin.announcements.title}</h1>
        <p>{en.admin.announcements.subtitle}</p>
      </header>

      <div className="panel admin-form-grid">
        <div className="form-field">
          <label htmlFor="announcement-title">{en.admin.announcements.fields.title}</label>
          <input
            id="announcement-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="form-field">
          <label htmlFor="announcement-body">{en.admin.announcements.fields.body}</label>
          <textarea
            id="announcement-body"
            className="field-textarea"
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </div>
        <div className="form-field">
          <label htmlFor="announcement-start">{en.admin.announcements.fields.startsAt}</label>
          <input
            id="announcement-start"
            type="date"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
          />
        </div>
        <div className="admin-inline-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => void previewMutation.mutateAsync({ title, body })}
          >
            {en.admin.announcements.previewAction}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void createAnnouncement()}
          >
            {en.admin.announcements.createAction}
          </button>
        </div>
        {previewMutation.data ? (
          <article className="admin-preview">
            <h3>{previewMutation.data.title}</h3>
            <p>{previewMutation.data.body}</p>
          </article>
        ) : null}
      </div>

      <div className="panel admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>{en.admin.announcements.columns.title}</th>
              <th>{en.admin.announcements.columns.level}</th>
              <th>{en.admin.announcements.columns.startsAt}</th>
              <th>{en.admin.announcements.columns.active}</th>
              <th>{en.admin.announcements.columns.actions}</th>
            </tr>
          </thead>
          <tbody>
            {(announcementsQuery.data ?? []).map((item) => (
              <tr key={item.id}>
                <td>{item.title}</td>
                <td>{item.level}</td>
                <td>{item.startsAt}</td>
                <td>{item.isActive ? en.admin.common.yes : en.admin.common.no}</td>
                <td className="admin-table-actions">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => {
                      void deleteMutation.mutateAsync(item.id);
                    }}
                  >
                    {en.admin.announcements.deleteAction}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
