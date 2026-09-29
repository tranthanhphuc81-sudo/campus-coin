/**
 * CategoryPicker.tsx
 * `<select>` of active categories for a given transaction type (own categories + active system
 * defaults; archived categories are hidden, matching `/categories`' default `includeInactive`
 * behaviour). Purely controlled — remembering the last-used category is the caller's job (see
 * `lastUsedCategory.ts`), since only the quick-add form wants that default, not every edit.
 * Exports: CategoryPicker
 * Spec: docs/spec/05a §5.3 (categories), §5.4.1 (quick-add category select)
 */
import type { TransactionType } from '@campuscoin/shared';
import { useCategoriesQuery } from '../../categories/hooks';
import { en } from '../../../i18n/en';

interface CategoryPickerProps {
  id: string;
  type: TransactionType;
  value: number | null;
  onChange: (categoryId: number) => void;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
}

/** Category `<select>` scoped to one transaction type, sourced from `GET /categories`. */
export function CategoryPicker({ id, type, value, onChange, invalid, describedBy, disabled }: CategoryPickerProps) {
  const categoriesQuery = useCategoriesQuery({ type });
  const categories = categoriesQuery.data ?? [];

  return (
    <select
      id={id}
      className={`form-select${invalid ? ' is-invalid' : ''}`}
      aria-describedby={describedBy}
      disabled={disabled || categoriesQuery.isLoading}
      value={value ?? ''}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      <option value="" disabled>
        {categoriesQuery.isLoading ? en.common.loading : en.transactions.form.categoryPlaceholder}
      </option>
      {categories.length === 0 && !categoriesQuery.isLoading ? (
        <option value="" disabled>
          {en.transactions.form.categoryEmpty}
        </option>
      ) : null}
      {categories.map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
        </option>
      ))}
    </select>
  );
}
