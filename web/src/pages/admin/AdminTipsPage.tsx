import { useState } from "react";

import { en } from "@/content/en";
import {
  useAdminTipTemplates,
  useCreateAdminTipTemplate,
  useDeleteAdminTipTemplate,
  usePreviewTipTemplate,
  type AdminTipTemplate,
} from "@/features/admin/hooks";

const DEFAULT_RULE = "GENERAL";

export default function AdminTipsPage() {
  const templatesQuery = useAdminTipTemplates();
  const createMutation = useCreateAdminTipTemplate();
  const deleteMutation = useDeleteAdminTipTemplate();
  const previewMutation = usePreviewTipTemplate();

  const [code, setCode] = useState("");
  const [titleTpl, setTitleTpl] = useState("");
  const [bodyTpl, setBodyTpl] = useState("");

  const createTemplate = async () => {
    if (!code.trim() || !titleTpl.trim() || !bodyTpl.trim()) {
      return;
    }

    await createMutation.mutateAsync({
      code: code.trim(),
      ruleType: DEFAULT_RULE,
      titleTpl: titleTpl.trim(),
      bodyTpl: bodyTpl.trim(),
      locale: "en",
      isActive: true,
    });

    setCode("");
    setTitleTpl("");
    setBodyTpl("");
  };

  return (
    <section className="admin-page">
      <header className="admin-page__header">
        <h1>{en.admin.tips.title}</h1>
        <p>{en.admin.tips.subtitle}</p>
      </header>

      <div className="panel admin-form-grid">
        <div className="form-field">
          <label htmlFor="tip-code">{en.admin.tips.fields.code}</label>
          <input id="tip-code" value={code} onChange={(event) => setCode(event.target.value)} />
        </div>
        <div className="form-field">
          <label htmlFor="tip-title">{en.admin.tips.fields.titleTpl}</label>
          <input
            id="tip-title"
            value={titleTpl}
            onChange={(event) => setTitleTpl(event.target.value)}
          />
        </div>
        <div className="form-field">
          <label htmlFor="tip-body">{en.admin.tips.fields.bodyTpl}</label>
          <textarea
            id="tip-body"
            className="field-textarea"
            value={bodyTpl}
            onChange={(event) => setBodyTpl(event.target.value)}
          />
        </div>
        <div className="admin-inline-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => void previewMutation.mutateAsync({ titleTpl, bodyTpl })}
          >
            {en.admin.tips.previewAction}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void createTemplate()}>
            {en.admin.tips.createAction}
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
              <th>{en.admin.tips.columns.code}</th>
              <th>{en.admin.tips.columns.ruleType}</th>
              <th>{en.admin.tips.columns.title}</th>
              <th>{en.admin.tips.columns.actions}</th>
            </tr>
          </thead>
          <tbody>
            {(templatesQuery.data ?? []).map((template: AdminTipTemplate) => (
              <tr key={template.id}>
                <td>{template.code}</td>
                <td>{template.ruleType}</td>
                <td>{template.titleTpl}</td>
                <td className="admin-table-actions">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => {
                      void deleteMutation.mutateAsync(template.id);
                    }}
                  >
                    {en.admin.tips.deleteAction}
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
