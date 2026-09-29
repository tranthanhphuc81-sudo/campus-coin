/**
 * PrivacyTab.tsx
 * "Privacy" tab of Profile & Settings: AI opt-in toggle (immediate `PATCH /me`, reverted on
 * failure), a data-export action (`GET /me/export`, JSON or CSV/zip), and the account-deletion
 * flow (opens `DeleteAccountModal`, `DELETE /me`).
 * Exports: PrivacyTab
 * Spec: docs/spec/05a §5.2 (privacy) · docs/spec/09 §9.14 (data lifecycle) · docs/spec/07 §7.3.1
 */
import { useState, type ChangeEvent } from 'react';
import Spinner from 'react-bootstrap/Spinner';
import { useToast } from '../../../components/ToastProvider';
import { en } from '../../../i18n/en';
import { apiClient } from '../../../lib/apiClient/apiClient';
import type { ApiError } from '../../../lib/apiClient/apiError';
import { useAuth } from '../../../lib/auth/AuthContext';
import type { UserDto } from '../../../lib/auth/types';
import { downloadBlob } from '../../../lib/download';
import { DeleteAccountModal } from './DeleteAccountModal';
import { useExportMyDataMutation } from '../hooks';

/** AI opt-in toggle + the (P16) data-export and account-deletion actions. */
export function PrivacyTab() {
  const { user, setUser } = useAuth();
  const { showToast } = useToast();
  const [checked, setChecked] = useState(user?.aiOptIn ?? false);
  const [pending, setPending] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const exportMutation = useExportMyDataMutation();
  const t = en.profileSettings.privacy;

  // Guarded after hooks: the auth-gated route always has a user, but hooks must run unconditionally.
  if (!user) return null;

  async function handleToggle(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.checked;
    setChecked(next);
    setPending(true);
    try {
      const response = await apiClient.patch<UserDto>('/me', { aiOptIn: next });
      setUser(response.data);
      showToast({ message: t.saved });
    } catch {
      // Roll back the visible toggle so the UI never claims a preference that was not saved.
      setChecked(!next);
      showToast({ message: en.errors.generic });
    } finally {
      setPending(false);
    }
  }

  /** Downloads the user's data export; the endpoint is rate-limited to 3 calls/day (429). */
  async function handleExport(format: 'json' | 'csv') {
    try {
      const { blob, filename } = await exportMutation.mutateAsync(format);
      downloadBlob(blob, filename);
    } catch (err) {
      const error = err as ApiError;
      showToast({ message: error.status === 429 ? t.exportRateLimited : t.exportFailed });
    }
  }

  return (
    <section>
      <div className="form-check form-switch mb-2">
        <input
          id="aiOptIn"
          className="form-check-input"
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={pending}
          onChange={(event) => void handleToggle(event)}
        />
        <label className="form-check-label" htmlFor="aiOptIn">
          {t.aiOptInLabel}
        </label>
      </div>
      <p className="text-body-secondary">{t.aiOptInBody}</p>

      <hr />

      <h2 className="h5">{t.exportTitle}</h2>
      <p>{t.exportBody}</p>
      <div className="d-flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-outline-secondary"
          disabled={exportMutation.isPending}
          onClick={() => void handleExport('json')}
        >
          {exportMutation.isPending ? <Spinner animation="border" size="sm" className="me-2" aria-hidden="true" /> : null}
          {t.exportButtonJson}
        </button>
        <button
          type="button"
          className="btn btn-outline-secondary"
          disabled={exportMutation.isPending}
          onClick={() => void handleExport('csv')}
        >
          {exportMutation.isPending ? <Spinner animation="border" size="sm" className="me-2" aria-hidden="true" /> : null}
          {t.exportButtonCsv}
        </button>
      </div>

      <hr />

      <h2 className="h5">{t.deleteTitle}</h2>
      <p>{t.deleteBody}</p>
      <button type="button" className="btn btn-outline-danger" onClick={() => setShowDeleteModal(true)}>
        {t.deleteButton}
      </button>

      <DeleteAccountModal show={showDeleteModal} onClose={() => setShowDeleteModal(false)} />
    </section>
  );
}
