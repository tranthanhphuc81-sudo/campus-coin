/**
 * MyCategoriesPage.tsx
 * Student custom categories page (`/app/categories`): read-only default categories, plus the
 * caller's own personal categories with add/edit/delete (archive/reassign on delete-in-use).
 * Exports: default (MyCategoriesPage)
 * Spec: docs/spec/05a §5.3 (categories) · Rules: BR-CA-01..05
 */
import type { CategoryDto } from '@campuscoin/shared';
import { useState, type ReactNode } from 'react';
import { EmptyState } from '../../../components/EmptyState';
import { ErrorState } from '../../../components/ErrorState';
import { PageHeader } from '../../../components/PageHeader';
import { TableSkeleton } from '../../../components/Skeletons';
import { en } from '../../../i18n/en';
import { CategoryFormModal } from '../components/CategoryFormModal';
import { DeleteCategoryModal } from '../components/DeleteCategoryModal';
import { useCategoriesQuery } from '../hooks';

function CategoryChip({ category, actions }: { category: CategoryDto; actions?: ReactNode }) {
  return (
    <div className="col-6 col-md-4 col-lg-3">
      <div className="card h-100">
        <div className="card-body d-flex flex-column gap-1">
          <div className="d-flex align-items-center gap-2">
            <span
              className="d-inline-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
              style={{ width: '2rem', height: '2rem', backgroundColor: category.color ?? '#6c757d', color: '#fff' }}
            >
              <i className={`bi bi-${category.icon || 'tag'}`} aria-hidden="true" />
            </span>
            <span className="fw-semibold text-truncate">{category.name}</span>
          </div>
          <div>
            {category.isDefault ? <span className="badge text-bg-secondary">{en.categories.default}</span> : null}
            {!category.isActive ? <span className="badge text-bg-secondary ms-1">{en.categories.archived}</span> : null}
          </div>
          {actions ? <div className="mt-auto d-flex gap-2">{actions}</div> : null}
        </div>
      </div>
    </div>
  );
}

/** Read-only default categories + the caller's own personal categories (CRUD). */
export default function MyCategoriesPage() {
  const categoriesQuery = useCategoriesQuery({ includeInactive: true });
  const [showCreate, setShowCreate] = useState(false);
  const [editCategory, setEditCategory] = useState<CategoryDto | null>(null);
  const [deleteCategory, setDeleteCategory] = useState<CategoryDto | null>(null);

  const categories = categoriesQuery.data ?? [];
  const defaults = categories.filter((c) => c.isDefault);
  const own = categories.filter((c) => !c.isDefault);

  return (
    <>
      <PageHeader
        title={en.categories.pageTitle}
        subtitle={en.categories.subtitle}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
            {en.categories.addButton}
          </button>
        }
      />

      {categoriesQuery.isLoading ? (
        <TableSkeleton rows={4} />
      ) : categoriesQuery.isError ? (
        <ErrorState onRetry={() => void categoriesQuery.refetch()} />
      ) : (
        <>
          <h2 className="h5">{en.categories.defaultSection}</h2>
          <div className="row g-2 mb-4">
            {defaults.map((category) => (
              <CategoryChip key={category.id} category={category} />
            ))}
          </div>

          <h2 className="h5">{en.categories.ownSection}</h2>
          {own.length === 0 ? (
            <EmptyState icon="bi-tags" message={en.categories.empty} actionLabel={en.categories.addButton} onAction={() => setShowCreate(true)} />
          ) : (
            <div className="row g-2">
              {own.map((category) => (
                <CategoryChip
                  key={category.id}
                  category={category}
                  actions={
                    <>
                      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setEditCategory(category)}>
                        {en.categories.edit}
                      </button>
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setDeleteCategory(category)}>
                        {en.categories.delete}
                      </button>
                    </>
                  }
                />
              ))}
            </div>
          )}
        </>
      )}

      <CategoryFormModal show={showCreate} onClose={() => setShowCreate(false)} />
      <CategoryFormModal show={editCategory !== null} category={editCategory ?? undefined} onClose={() => setEditCategory(null)} />
      <DeleteCategoryModal category={deleteCategory} onClose={() => setDeleteCategory(null)} />
    </>
  );
}
