import { z } from "zod";

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

export const authUserSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  email: emailSchema,
  role: authRoleSchema,
  emailVerifiedAt: z.string().nullable().optional(),
});

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

export type AuthRole = z.infer<typeof authRoleSchema>;
export type RegisterInput = z.infer<typeof registerInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type AdminLoginInput = z.infer<typeof adminLoginInputSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailInputSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordInputSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type AuthSession = z.infer<typeof authSessionSchema>;
export type CategoryType = z.infer<typeof categoryTypeSchema>;
export type Category = z.infer<typeof categorySchema>;
export type CreateCategoryInput = z.infer<typeof createCategoryInputSchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategoryInputSchema>;
