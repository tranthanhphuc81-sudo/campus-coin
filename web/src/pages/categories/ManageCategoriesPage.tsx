import {
  createCategoryInputSchema,
  updateCategoryInputSchema,
  type Category,
  type CategoryType,
} from "@campus-coin/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";

import { en } from "@/content/en";
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from "@/features/categories/hooks";
import LoadingButton from "@/components/common/LoadingButton";
import { parseProblem } from "@/lib/problem";
import { useDialogA11y } from "@/lib/useDialogA11y";

type CategoryFormValues = {
  name: string;
  icon?: string;
  color?: string;
  sortOrder?: number;
};

const ICON_OPTIONS = [
  "bi-wallet2",
  "bi-briefcase",
  "bi-cup-hot",
  "bi-bus-front",
  "bi-house-door",
  "bi-journal-text",
  "bi-controller",
  "bi-three-dots",
] as const;

function normalizeOptionalText(value: string | undefined): string | undefined {
  const nextValue = value?.trim();
  return nextValue ? nextValue : undefined;
}

export default function ManageCategoriesPage() {
  const [activeType, setActiveType] = useState<CategoryType>("expense");
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [reassignTo, setReassignTo] = useState<number | undefined>(undefined);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const editorDialogRef = useRef<HTMLDivElement | null>(null);
  const deleteDialogRef = useRef<HTMLDivElement | null>(null);

  const categoriesQuery = useCategories(activeType);
  const createCategoryMutation = useCreateCategory();
  const updateCategoryMutation = useUpdateCategory();
  const deleteCategoryMutation = useDeleteCategory();

  const categories = categoriesQuery.data ?? [];

  const replacementCandidates = deletingCategory
    ? categories.filter((category) => category.id !== deletingCategory.id)
    : [];

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(
      createCategoryInputSchema.omit({
        type: true,
      }),
    ),
    defaultValues: {
      name: "",
      icon: ICON_OPTIONS[0],
      color: "#3A86FF",
      sortOrder: 0,
    },
  });

  const isEditing = Boolean(editingCategory);

  const openCreateModal = () => {
    setEditingCategory({
      id: -1,
      name: "",
      type: activeType,
      icon: ICON_OPTIONS[0],
      color: "#3A86FF",
      isDefault: false,
      isActive: true,
      sortOrder: 0,
    });
    form.reset({
      name: "",
      icon: ICON_OPTIONS[0],
      color: "#3A86FF",
      sortOrder: 0,
    });
  };

  const openEditModal = (category: Category) => {
    setEditingCategory(category);
    form.reset({
      name: category.name,
      icon: category.icon ?? ICON_OPTIONS[0],
      color: category.color ?? "#3A86FF",
      sortOrder: category.sortOrder,
    });
  };

  const closeModal = () => {
    setEditingCategory(null);
    form.clearErrors();
  };

  useDialogA11y({
    isOpen: Boolean(editingCategory),
    containerRef: editorDialogRef,
    onClose: closeModal,
  });

  useDialogA11y({
    isOpen: Boolean(deletingCategory),
    containerRef: deleteDialogRef,
    onClose: () => {
      setDeletingCategory(null);
      setReassignTo(undefined);
    },
  });

  const submitCategory = form.handleSubmit(async (values) => {
    setFlashMessage(null);

    try {
      if (editingCategory && editingCategory.id > 0) {
        const payload = updateCategoryInputSchema.parse({
          name: values.name,
          icon: normalizeOptionalText(values.icon) ?? null,
          color: normalizeOptionalText(values.color) ?? null,
          sortOrder: values.sortOrder,
        });

        await updateCategoryMutation.mutateAsync({
          id: editingCategory.id,
          type: activeType,
          data: payload,
        });

        setFlashMessage(en.categories.messages.updated);
      } else {
        const payload = createCategoryInputSchema.parse({
          name: values.name,
          type: activeType,
          icon: normalizeOptionalText(values.icon),
          color: normalizeOptionalText(values.color),
          sortOrder: values.sortOrder,
        });

        await createCategoryMutation.mutateAsync(payload);
        setFlashMessage(en.categories.messages.created);
      }

      closeModal();
    } catch (error) {
      const problem = parseProblem(error);
      setFlashMessage(problem.detail || en.categories.messages.saveFailed);
    }
  });

  const confirmDelete = async () => {
    if (!deletingCategory) {
      return;
    }

    setFlashMessage(null);

    try {
      await deleteCategoryMutation.mutateAsync({
        id: deletingCategory.id,
        type: activeType,
        reassignTo,
      });
      setFlashMessage(en.categories.messages.deleted);
      setDeletingCategory(null);
      setReassignTo(undefined);
    } catch (error) {
      const problem = parseProblem(error);
      setFlashMessage(problem.detail || en.categories.messages.deleteFailed);
    }
  };

  return (
    <section className="categories-page">
      <header className="categories-page__header">
        <div>
          <h1>{en.categories.title}</h1>
          <p>{en.categories.subtitle}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreateModal}>
          {en.categories.addAction}
        </button>
      </header>

      <div className="categories-tabs" role="tablist" aria-label={en.categories.typeTabsAriaLabel}>
        <button
          type="button"
          role="tab"
          aria-selected={activeType === "expense"}
          className={activeType === "expense" ? "is-active" : ""}
          onClick={() => setActiveType("expense")}
        >
          {en.categories.expenseTab}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeType === "income"}
          className={activeType === "income" ? "is-active" : ""}
          onClick={() => setActiveType("income")}
        >
          {en.categories.incomeTab}
        </button>
      </div>

      {flashMessage ? <p className="flash-success">{flashMessage}</p> : null}

      {categoriesQuery.isLoading ? <p>{en.common.loadingLabel}</p> : null}

      <div className="categories-grid">
        {categories.map((category) => (
          <article key={category.id} className="category-card">
            <div className="category-card__main">
              <span
                className="category-icon"
                style={{ backgroundColor: category.color ?? "#8894AA" }}
              >
                {category.icon ?? "bi-tag"}
              </span>
              <div>
                <h2>{category.name}</h2>
                <p>
                  {category.isDefault ? en.categories.defaultBadge : en.categories.personalBadge} ·
                  #{category.sortOrder}
                </p>
              </div>
            </div>

            {!category.isDefault ? (
              <div className="category-card__actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => openEditModal(category)}
                >
                  {en.categories.editAction}
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setDeletingCategory(category);
                    setReassignTo(undefined);
                  }}
                >
                  {en.categories.deleteAction}
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>

      {editingCategory ? (
        <div className="dialog-backdrop" role="presentation">
          <div
            ref={editorDialogRef}
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="category-dialog-title"
          >
            <h2 id="category-dialog-title">
              {isEditing ? en.categories.editDialogTitle : en.categories.createDialogTitle}
            </h2>

            <form className="form-stack" onSubmit={submitCategory} noValidate>
              <div className="form-field">
                <label htmlFor="category-name">{en.categories.form.nameLabel}</label>
                <input
                  id="category-name"
                  type="text"
                  aria-invalid={Boolean(form.formState.errors.name)}
                  aria-describedby={form.formState.errors.name ? "category-name-error" : undefined}
                  {...form.register("name")}
                />
                {form.formState.errors.name ? (
                  <p id="category-name-error" className="form-error" role="alert">
                    {form.formState.errors.name.message}
                  </p>
                ) : null}
              </div>

              <div className="form-field">
                <label htmlFor="category-icon">{en.categories.form.iconLabel}</label>
                <select id="category-icon" className="field-select" {...form.register("icon")}>
                  {ICON_OPTIONS.map((iconOption) => (
                    <option key={iconOption} value={iconOption}>
                      {iconOption}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="category-color">{en.categories.form.colorLabel}</label>
                <input id="category-color" type="color" {...form.register("color")} />
              </div>

              <div className="form-field">
                <label htmlFor="category-order">{en.categories.form.sortOrderLabel}</label>
                <input
                  id="category-order"
                  type="number"
                  min={0}
                  max={999}
                  aria-invalid={Boolean(form.formState.errors.sortOrder)}
                  aria-describedby={
                    form.formState.errors.sortOrder ? "category-order-error" : undefined
                  }
                  {...form.register("sortOrder", {
                    valueAsNumber: true,
                  })}
                />
                {form.formState.errors.sortOrder ? (
                  <p id="category-order-error" className="form-error" role="alert">
                    {form.formState.errors.sortOrder.message}
                  </p>
                ) : null}
              </div>

              <div className="dialog-actions">
                <button type="button" className="btn btn-outline" onClick={closeModal}>
                  {en.categories.cancelAction}
                </button>
                <LoadingButton
                  type="submit"
                  isLoading={createCategoryMutation.isPending || updateCategoryMutation.isPending}
                  loadingLabel={en.common.loadingLabel}
                >
                  {en.categories.saveAction}
                </LoadingButton>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deletingCategory ? (
        <div className="dialog-backdrop" role="presentation">
          <div
            ref={deleteDialogRef}
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-category-dialog-title"
          >
            <h2 id="delete-category-dialog-title">{en.categories.deleteDialogTitle}</h2>
            <p>{en.categories.deleteDialogDescription}</p>

            <div className="form-field">
              <label htmlFor="reassign-to">{en.categories.form.reassignToLabel}</label>
              <select
                id="reassign-to"
                className="field-select"
                value={reassignTo ?? ""}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  setReassignTo(
                    Number.isFinite(nextValue) && nextValue > 0 ? nextValue : undefined,
                  );
                }}
              >
                <option value="">{en.categories.form.reassignToPlaceholder}</option>
                {replacementCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="dialog-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setDeletingCategory(null);
                  setReassignTo(undefined);
                }}
              >
                {en.categories.cancelAction}
              </button>
              <LoadingButton
                type="button"
                isLoading={deleteCategoryMutation.isPending}
                loadingLabel={en.common.loadingLabel}
                onClick={() => {
                  void confirmDelete();
                }}
              >
                {en.categories.confirmDeleteAction}
              </LoadingButton>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
