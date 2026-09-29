/**
 * AdminDefaultCategoriesPage.tsx
 * Admin default-categories page (`/admin/categories`): a table of every system default category
 * (icon, name, type, colour, sort order, active/archived), add/edit modal, and delete with the
 * 409-in-use -> archive fallback.
 * Exports: default (AdminDefaultCategoriesPage)
 * Spec: docs/spec/05a §5.3 · docs/spec/05c §5.13
 */
import { TransactionType, type CategoryDto } from '@campuscoin/shared';
import { useState } from 'react';
import { EmptyState } from '../../../components/EmptyState';
import { ErrorState } from '../../../components/ErrorState';
import { PageHeader } from '../../../components/PageHeader';
import { TableSkeleton } from '../../../components/Skeletons';
import { en } from '../../../i18n/en';
import { AdminCategoryFormModal } from '../components/AdminCategoryFormModal';
import { DeleteAdminCategoryModal } from '../components/DeleteAdminCategoryModal';
import { useAdminCategoriesQuery } from '../hooks';

/** Admin default-categories page: list, add/edit, delete-or-archive. */
export default function AdminDefaultCategoriesPage() {
  const t = en.adminCategories;
  const categoriesQuery = useAdminCategoriesQuery();
  const [showCreate, setShowCreate] = useState(false);
  const [editCategory, setEditCategory] = useState<CategoryDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CategoryDto | null>(null);

  const categories = [...(categoriesQuery.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <>
      <PageHeader
        title={en.nav.adminCategories}
        subtitle={t.subtitle}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
            {t.addButton}
          </button>
        }
      />

      {categoriesQuery.isLoading ? (
        <TableSkeleton rows={8} />
      ) : categoriesQuery.isError ? (
        <ErrorState message={t.loadError} onRetry={() => void categoriesQuery.refetch()} />
      ) : categories.length === 0 ? (
        <EmptyState icon="bi-tags" message={t.empty} actionLabel={t.addButton} onAction={() => setShowCreate(true)} />
      ) : (
        <div className="table-responsive">
          <table className="table align-middle">
            <thead>
              <tr>
                <th scope="col">{t.table.icon}</th>
                <th scope="col">{t.table.name}</th>
                <th scope="col">{t.table.type}</th>
                <th scope="col">{t.table.color}</th>
                <th scope="col">{t.table.sortOrder}</th>
                <th scope="col">{t.table.status}</th>
                <th scope="col" className="text-end">
                  {t.table.actions}
                </th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.id}>
                  <td>
                    <span
                      className="d-inline-flex align-items-center justify-content-center rounded-circle"
                      style={{ width: '2rem', height: '2rem', backgroundColor: category.color ?? '#6c757d', color: '#fff' }}
                    >
                      <i className={`bi bi-${category.icon || 'tag'}`} aria-hidden="true" />
                    </span>
                  </td>
                  <td>{category.name}</td>
                  <td>{category.type === TransactionType.INCOME ? t.typeIncome : t.typeExpense}</td>
                  <td>
                    <span
                      className="d-inline-block rounded border align-middle me-2"
                      style={{ width: '1rem', height: '1rem', backgroundColor: category.color ?? '#6c757d' }}
                      aria-hidden="true"
                    />
                    {category.color ?? '—'}
                  </td>
                  <td>{category.sortOrder}</td>
                  <td>
                    <span className={`badge text-bg-${category.isActive ? 'success' : 'secondary'}`}>{category.isActive ? t.active : t.archived}</span>
                  </td>
                  <td className="text-end">
                    <button type="button" className="btn btn-sm btn-outline-secondary me-2" onClick={() => setEditCategory(category)}>
                      {t.edit}
                    </button>
                    <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setDeleteTarget(category)}>
                      {t.delete}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminCategoryFormModal show={showCreate} onClose={() => setShowCreate(false)} />
      <AdminCategoryFormModal show={editCategory !== null} category={editCategory ?? undefined} onClose={() => setEditCategory(null)} />
      <DeleteAdminCategoryModal category={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </>
  );
}
