import { useMemo, useState } from "react";

import { en } from "@/content/en";
import {
  useAdminDefaultCategories,
  useCreateAdminDefaultCategory,
  useDeleteAdminDefaultCategory,
  useUpdateAdminDefaultCategory,
  type AdminDefaultCategory,
} from "@/features/admin/hooks";

export default function AdminCategoriesPage() {
  const categoriesQuery = useAdminDefaultCategories();
  const createMutation = useCreateAdminDefaultCategory();
  const updateMutation = useUpdateAdminDefaultCategory();
  const deleteMutation = useDeleteAdminDefaultCategory();

  const [draftName, setDraftName] = useState("");
  const [draggingId, setDraggingId] = useState<number | null>(null);

  const sorted = useMemo(() => {
    return [...(categoriesQuery.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [categoriesQuery.data]);

  const createCategory = async () => {
    if (!draftName.trim()) {
      return;
    }

    await createMutation.mutateAsync({
      name: draftName.trim(),
      type: "expense",
      icon: null,
      color: "#3A86FF",
      isActive: true,
      sortOrder: sorted.length,
    });

    setDraftName("");
  };

  const moveCategory = async (target: AdminDefaultCategory) => {
    if (draggingId === null || draggingId === target.id) {
      return;
    }

    const dragged = sorted.find((item) => item.id === draggingId);
    if (!dragged) {
      return;
    }

    await Promise.all([
      updateMutation.mutateAsync({ id: dragged.id, data: { sortOrder: target.sortOrder } }),
      updateMutation.mutateAsync({ id: target.id, data: { sortOrder: dragged.sortOrder } }),
    ]);
    setDraggingId(null);
  };

  return (
    <section className="admin-page">
      <header className="admin-page__header admin-page__header-row">
        <div>
          <h1>{en.admin.categories.title}</h1>
          <p>{en.admin.categories.subtitle}</p>
        </div>
        <div className="admin-inline-form">
          <input
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            placeholder={en.admin.categories.newCategoryPlaceholder}
            aria-label={en.admin.categories.newCategoryPlaceholder}
          />
          <button type="button" className="btn btn-primary" onClick={() => void createCategory()}>
            {en.admin.categories.createAction}
          </button>
        </div>
      </header>

      {categoriesQuery.isLoading ? <p>{en.common.loadingLabel}</p> : null}

      <div className="panel admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>{en.admin.categories.columns.order}</th>
              <th>{en.admin.categories.columns.name}</th>
              <th>{en.admin.categories.columns.type}</th>
              <th>{en.admin.categories.columns.active}</th>
              <th>{en.admin.categories.columns.actions}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((category) => (
              <tr
                key={category.id}
                draggable
                onDragStart={() => setDraggingId(category.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  void moveCategory(category);
                }}
              >
                <td>{category.sortOrder}</td>
                <td>{category.name}</td>
                <td>{category.type}</td>
                <td>{category.isActive ? en.admin.common.yes : en.admin.common.no}</td>
                <td className="admin-table-actions">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => {
                      void updateMutation.mutateAsync({
                        id: category.id,
                        data: { isActive: !category.isActive },
                      });
                    }}
                  >
                    {category.isActive
                      ? en.admin.categories.hideAction
                      : en.admin.categories.showAction}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => {
                      void deleteMutation.mutateAsync(category.id);
                    }}
                  >
                    {en.admin.categories.deleteAction}
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
