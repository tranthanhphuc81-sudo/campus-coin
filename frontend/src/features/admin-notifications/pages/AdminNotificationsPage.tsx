/**
 * AdminNotificationsPage.tsx
 * Admin system-announcements page (mounted at `/admin/notifications`, "System Notifications" in the
 * nav — these are the dashboard/public banner announcements, not the per-student notification bell).
 * Table (title, level, computed status, starts/ends), add/edit modal, plain delete confirm (hard
 * delete always succeeds, no special fallback needed).
 * Exports: default (AdminNotificationsPage)
 * Spec: docs/spec/05c §5.13 · docs/spec/08 §8.3
 */
import { AnnouncementLevel, type AdminAnnouncementDto } from '@campuscoin/shared';
import { useState } from 'react';
import { ConfirmModal } from '../../../components/ConfirmModal';
import { EmptyState } from '../../../components/EmptyState';
import { ErrorState } from '../../../components/ErrorState';
import { PageHeader } from '../../../components/PageHeader';
import { TableSkeleton } from '../../../components/Skeletons';
import { useToast } from '../../../components/ToastProvider';
import { en } from '../../../i18n/en';
import { formatDateTime } from '../../../lib/dates';
import { deriveAnnouncementStatus, type AnnouncementStatus } from '../announcementStatus';
import { AnnouncementFormModal } from '../components/AnnouncementFormModal';
import { useAdminAnnouncementsQuery, useDeleteAdminAnnouncementMutation } from '../hooks';

const STATUS_BADGE: Record<AnnouncementStatus, string> = {
  active: 'success',
  scheduled: 'info',
  expired: 'secondary',
  inactive: 'secondary',
};

const STATUS_LABEL: Record<AnnouncementStatus, string> = {
  active: en.adminAnnouncements.statusActive,
  scheduled: en.adminAnnouncements.statusScheduled,
  expired: en.adminAnnouncements.statusExpired,
  inactive: en.adminAnnouncements.statusInactive,
};

/** Admin system-announcements page: list with a derived Active/Scheduled/Expired/Inactive status, add/edit/delete. */
export default function AdminNotificationsPage() {
  const t = en.adminAnnouncements;
  const { showToast } = useToast();
  const announcementsQuery = useAdminAnnouncementsQuery();
  const deleteMutation = useDeleteAdminAnnouncementMutation();
  const [showCreate, setShowCreate] = useState(false);
  const [editAnnouncement, setEditAnnouncement] = useState<AdminAnnouncementDto | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminAnnouncementDto | null>(null);

  const announcements = announcementsQuery.data ?? [];

  function handleConfirmDelete() {
    if (!confirmDelete) return;
    const id = confirmDelete.id;
    setConfirmDelete(null);
    deleteMutation.mutate(id, { onSuccess: () => showToast({ message: t.deleted }) });
  }

  return (
    <>
      <PageHeader
        title={en.nav.adminNotifications}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
            {t.addButton}
          </button>
        }
      />

      {announcementsQuery.isLoading ? (
        <TableSkeleton rows={5} />
      ) : announcementsQuery.isError ? (
        <ErrorState message={t.loadError} onRetry={() => void announcementsQuery.refetch()} />
      ) : announcements.length === 0 ? (
        <EmptyState icon="bi-megaphone" message={t.empty} actionLabel={t.addButton} onAction={() => setShowCreate(true)} />
      ) : (
        <div className="table-responsive">
          <table className="table align-middle">
            <thead>
              <tr>
                <th scope="col">{t.table.title}</th>
                <th scope="col">{t.table.level}</th>
                <th scope="col">{t.table.status}</th>
                <th scope="col">{t.table.startsAt}</th>
                <th scope="col">{t.table.endsAt}</th>
                <th scope="col" className="text-end">
                  {t.table.actions}
                </th>
              </tr>
            </thead>
            <tbody>
              {announcements.map((announcement) => {
                const status = deriveAnnouncementStatus(announcement);
                return (
                  <tr key={announcement.id}>
                    <td>{announcement.title}</td>
                    <td>
                      <span className={`badge text-bg-${announcement.level === AnnouncementLevel.WARNING ? 'warning' : 'info'}`}>
                        {announcement.level === AnnouncementLevel.WARNING ? t.levelWarning : t.levelInfo}
                      </span>
                    </td>
                    <td>
                      <span className={`badge text-bg-${STATUS_BADGE[status]}`}>{STATUS_LABEL[status]}</span>
                    </td>
                    <td>{formatDateTime(announcement.startsAt)}</td>
                    <td>{announcement.endsAt ? formatDateTime(announcement.endsAt) : t.noEnd}</td>
                    <td className="text-end">
                      <button type="button" className="btn btn-sm btn-outline-secondary me-2" onClick={() => setEditAnnouncement(announcement)}>
                        {t.edit}
                      </button>
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setConfirmDelete(announcement)}>
                        {t.delete}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AnnouncementFormModal show={showCreate} onClose={() => setShowCreate(false)} />
      <AnnouncementFormModal show={editAnnouncement !== null} announcement={editAnnouncement ?? undefined} onClose={() => setEditAnnouncement(null)} />

      <ConfirmModal
        show={confirmDelete !== null}
        title={t.deleteConfirmTitle}
        body={t.deleteConfirmBody}
        variant="danger"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}
