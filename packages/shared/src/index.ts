import { z } from "zod";

export const ABS_FLOOR_BY_CURRENCY: Record<string, number> = {
  USD: 5,
  VND: 100000,
  default: 5,
};

export const CURRENCY_MINOR_DIGITS: Record<string, number> = {
  USD: 2,
  VND: 0,
  default: 2,
};

export const pingSchema = z.object({
  status: z.literal("ok"),
});

export type Ping = z.infer<typeof pingSchema>;

export const authRoleSchema = z.enum(["student", "admin"]);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Please enter a valid email address.")
  .max(254, "Email must be 254 characters or fewer.");

export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters long.")
  .max(128, "Password must be 128 characters or fewer.")
  .regex(/[a-z]/, "Password must include a lowercase letter.")
  .regex(/[A-Z]/, "Password must include an uppercase letter.")
  .regex(/\d/, "Password must include a number.")
  .regex(/[^A-Za-z0-9]/, "Password must include a symbol.");

export const registerInputSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Full name must be at least 2 characters long.")
      .max(120, "Full name must be 120 characters or fewer."),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .superRefine(({ confirmPassword, password }, context) => {
    if (confirmPassword !== password) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match.",
      });
    }
  });

export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required."),
  rememberMe: z.boolean().optional(),
});

export const adminLoginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required."),
});

export const verifyEmailInputSchema = z.object({
  token: z.string().min(1, "Verification token is required."),
});

export const forgotPasswordInputSchema = z.object({
  email: emailSchema,
});

export const resetPasswordInputSchema = z
  .object({
    token: z.string().min(1, "Reset token is required."),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .superRefine(({ confirmPassword, password }, context) => {
    if (confirmPassword !== password) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match.",
      });
    }
  });

export const appearancePreferencesSchema = z.object({
  theme: z.enum(["light", "dark"]),
  fontScale: z.union([z.literal(90), z.literal(100), z.literal(115), z.literal(130)]),
});

export const authUserSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  email: emailSchema,
  role: authRoleSchema,
  emailVerifiedAt: z.string().nullable().optional(),
  aiOptIn: z.boolean(),
  preferences: appearancePreferencesSchema.nullable().optional(),
});

export const updateProfileInputSchema = z
  .object({
    aiOptIn: z.boolean().optional(),
    preferences: appearancePreferencesSchema.optional(),
  })
  .refine((profile) => profile.aiOptIn !== undefined || profile.preferences !== undefined);

export const authSessionSchema = z.object({
  accessToken: z.string().min(1),
  user: authUserSchema,
});

export const messageResponseSchema = z.object({
  message: z.string(),
});

export const categoryTypeSchema = z.enum(["income", "expense"]);

export const categorySchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(50),
  type: categoryTypeSchema,
  icon: z.string().nullable(),
  color: z.string().nullable(),
  isDefault: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
});

export const categoriesResponseSchema = z.object({
  data: z.array(categorySchema),
});

export const createCategoryInputSchema = z.object({
  name: z.string().trim().min(1).max(50),
  type: categoryTypeSchema,
  icon: z.string().trim().min(1).max(40).optional(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export const updateCategoryInputSchema = z
  .object({
    name: z.string().trim().min(1).max(50).optional(),
    icon: z.string().trim().min(1).max(40).nullable().optional(),
    color: z
      .string()
      .trim()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .nullable()
      .optional(),
    sortOrder: z.number().int().min(0).max(999).optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field is required.",
  });

export const deleteCategoryResponseSchema = z.object({
  archived: z.boolean(),
});

export const budgetLevelSchema = z.enum(["ok", "near", "exceeded"]);

export const budgetSchema = z.object({
  id: z.number().int().nonnegative(),
  categoryId: z.number().int().positive(),
  categoryName: z.string(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  limitAmount: z.string(),
  alertThresholdPct: z.number().int().min(50).max(100),
  spent: z.string(),
  percent: z.number(),
  level: budgetLevelSchema,
});

export const budgetsResponseSchema = z.object({
  data: z.array(budgetSchema),
});

export const upsertBudgetsInputSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  items: z
    .array(
      z.object({
        categoryId: z.number().int().positive(),
        limitAmount: z
          .string()
          .trim()
          .regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/),
        alertThresholdPct: z.number().int().min(50).max(100),
      }),
    )
    .min(1),
});

export const copyPreviousBudgetsInputSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});

export const copyPreviousBudgetsResponseSchema = z.object({
  copied: z.number().int().min(0),
  data: z.array(budgetSchema),
});

export const transactionTypeSchema = z.enum(["income", "expense"]);
export const transactionSourceSchema = z.enum(["manual", "recurring", "csv_import"]);

export const transactionSchema = z.object({
  id: z.string().uuid(),
  categoryId: z.number().int().positive(),
  categoryName: z.string().min(1),
  type: transactionTypeSchema,
  amount: z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/),
  description: z.string().nullable(),
  source: transactionSourceSchema,
  isAnomaly: z.boolean(),
  isPossibleDuplicate: z.boolean(),
  txnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const transactionsResponseSchema = z.object({
  data: z.array(transactionSchema),
});

export const createTransactionInputSchema = z.object({
  categoryId: z.number().int().positive(),
  type: transactionTypeSchema,
  amount: z
    .string()
    .trim()
    .regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/),
  description: z.string().trim().max(255).optional(),
  txnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  categorySource: z.enum(["user", "ai_accepted", "ai_overridden"]).optional(),
  aiSuggestedCategoryId: z.number().int().positive().nullable().optional(),
  aiConfidence: z.number().min(0).max(1).nullable().optional(),
});

export const updateTransactionInputSchema = z
  .object({
    categoryId: z.number().int().positive().optional(),
    type: transactionTypeSchema.optional(),
    amount: z
      .string()
      .trim()
      .regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/)
      .optional(),
    description: z.string().trim().max(255).nullable().optional(),
    txnDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    categorySource: z.enum(["user", "ai_accepted", "ai_overridden"]).optional(),
    aiSuggestedCategoryId: z.number().int().positive().nullable().optional(),
    aiConfidence: z.number().min(0).max(1).nullable().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field is required.",
  });

export const deleteTransactionResponseSchema = z.object({
  deleted: z.boolean(),
});

export const resolveTransactionFlagInputSchema = z.object({
  flag: z.enum(["anomaly", "duplicate"]),
  action: z.enum(["keep", "delete"]),
});

export const notificationTypeSchema = z.enum([
  "budget_near",
  "budget_exceeded",
  "insight_ready",
  "anomaly",
  "duplicate",
  "system",
]);

export const notificationSchema = z.object({
  id: z.string(),
  type: notificationTypeSchema,
  title: z.string(),
  body: z.string(),
  payload: z.unknown().nullable().optional(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

export const notificationsResponseSchema = z.object({
  data: z.array(notificationSchema),
  meta: z.object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(100),
    total: z.number().int().min(0),
    totalPages: z.number().int().min(1),
  }),
  unreadCount: z.number().int().min(0),
});

export const aiSuggestionSchema = z.object({
  categoryId: z.number().int().positive(),
  categoryName: z.string().min(1),
  confidence: z.number().min(0).max(1),
  source: z.enum(["user_rule", "keyword", "llm"]),
});

export const aiSuggestionResponseSchema = z.union([
  aiSuggestionSchema,
  z.object({ suggestion: z.null() }),
]);

export type AuthRole = z.infer<typeof authRoleSchema>;
export type RegisterInput = z.infer<typeof registerInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type AdminLoginInput = z.infer<typeof adminLoginInputSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailInputSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordInputSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;
export type AuthSession = z.infer<typeof authSessionSchema>;
export type CategoryType = z.infer<typeof categoryTypeSchema>;
export type Category = z.infer<typeof categorySchema>;
export type CreateCategoryInput = z.infer<typeof createCategoryInputSchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategoryInputSchema>;
export type BudgetLevel = z.infer<typeof budgetLevelSchema>;
export type Budget = z.infer<typeof budgetSchema>;
export type UpsertBudgetsInput = z.infer<typeof upsertBudgetsInputSchema>;
export type CopyPreviousBudgetsInput = z.infer<typeof copyPreviousBudgetsInputSchema>;
export type TransactionType = z.infer<typeof transactionTypeSchema>;
export type TransactionSource = z.infer<typeof transactionSourceSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionInputSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionInputSchema>;
export type ResolveTransactionFlagInput = z.infer<typeof resolveTransactionFlagInputSchema>;
export type NotificationType = z.infer<typeof notificationTypeSchema>;
export type Notification = z.infer<typeof notificationSchema>;
export type AiSuggestion = z.infer<typeof aiSuggestionSchema>;
