/**
 * categories.ts
 * The 12 system default categories (5 income, 7 expense) seeded for every environment.
 * `icon` is a Bootstrap Icons name (without the "bi-" prefix), `color` a HEX colour.
 * Names are also the targets of the tier-2 keyword dictionary (src/modules/ai/keywords.v1.json).
 * Main export: DEFAULT_CATEGORIES
 * Spec: docs/spec/05a §5.3 (Bảng 16) · docs/spec/06 §6.5
 */

/** Seed definition of one default category. */
export interface DefaultCategory {
  name: string;
  type: 'income' | 'expense';
  icon: string;
  color: string;
  sortOrder: number;
}

/** Default categories in display order. */
export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  // Income
  { name: 'Allowance', type: 'income', icon: 'wallet2', color: '#198754', sortOrder: 1 },
  { name: 'Part-time Job', type: 'income', icon: 'briefcase', color: '#20C997', sortOrder: 2 },
  { name: 'Scholarship', type: 'income', icon: 'mortarboard', color: '#0D6EFD', sortOrder: 3 },
  { name: 'Gift', type: 'income', icon: 'gift', color: '#D63384', sortOrder: 4 },
  { name: 'Other Income', type: 'income', icon: 'plus-circle', color: '#6C757D', sortOrder: 5 },
  // Expense
  { name: 'Food', type: 'expense', icon: 'cup-hot', color: '#FD7E14', sortOrder: 1 },
  { name: 'Transport', type: 'expense', icon: 'bus-front', color: '#0DCAF0', sortOrder: 2 },
  { name: 'Hostel/Rent', type: 'expense', icon: 'house-door', color: '#6F42C1', sortOrder: 3 },
  { name: 'Academics', type: 'expense', icon: 'book', color: '#0D6EFD', sortOrder: 4 },
  {
    name: 'Subscriptions',
    type: 'expense',
    icon: 'collection-play',
    color: '#DC3545',
    sortOrder: 5,
  },
  { name: 'Entertainment', type: 'expense', icon: 'film', color: '#FFC107', sortOrder: 6 },
  { name: 'Miscellaneous', type: 'expense', icon: 'three-dots', color: '#ADB5BD', sortOrder: 7 },
];
