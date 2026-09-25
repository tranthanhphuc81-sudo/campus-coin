export type CategoryWireType = "income" | "expense";

export type CategoryDto = {
  id: number;
  name: string;
  type: CategoryWireType;
  icon: string | null;
  color: string | null;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
};

export type CreateCategoryInput = {
  name: string;
  type: CategoryWireType;
  icon?: string;
  color?: string;
  sortOrder?: number;
};

export type UpdateCategoryInput = {
  name?: string;
  icon?: string | null;
  color?: string | null;
  sortOrder?: number;
};
