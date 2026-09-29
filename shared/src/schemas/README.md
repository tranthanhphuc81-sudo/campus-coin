# shared/src/schemas

Zod schemas shared by the backend (API edge validation) and the frontend (React Hook Form).

Conventions:

- One file per domain module, named like the backend module: `transactions.schema.ts`, `auth.schema.ts`, …
- Export the schema **and** its inferred type: `export const createTransactionSchema = z.object({...})`
  and `export type CreateTransactionInput = z.infer<typeof createTransactionSchema>`.
- Schemas **whitelist** fields (`z.object(...).strict()`); they never accept `userId`, `role` or `status`.
- Money is a decimal **string** (`"12.50"`), never a number. Limits come from `../constants.ts`.
- Error messages are English and short; field-level messages are shown directly in forms.
- Re-export every schema file from `src/index.ts`.
