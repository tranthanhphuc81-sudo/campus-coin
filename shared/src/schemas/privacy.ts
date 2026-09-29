/**
 * privacy.ts
 * Zod schemas for the privacy/data-lifecycle endpoints: `GET /me/export`, `DELETE /me`
 * (docs/spec/09 §9.14). `.strict()` on the body so no extra field (e.g. `reason`) is silently
 * accepted.
 * Main exports: exportQuerySchema, deleteAccountSchema + inferred *Input types
 * Spec: docs/spec/09 §9.14 (data lifecycle) · docs/spec/07 §7.3.1 (users/me)
 */
import { z } from 'zod';
import { DELETE_ACCOUNT_CONFIRM_PHRASE, PASSWORD_MAX_LENGTH } from '../constants.js';

/** Query of `GET /me/export`: `format=json` (default) or `format=csv` (zipped CSV). */
export const exportQuerySchema = z.object({ format: z.enum(['json', 'csv']).default('json') }).strict();
/** Inferred input type of {@link exportQuerySchema}. */
export type ExportQueryInput = z.infer<typeof exportQuerySchema>;

/**
 * Body of `DELETE /me`: the caller's current password (re-authentication for a destructive action)
 * plus a literal confirmation phrase, guarding against an accidental call from a scripted client.
 */
export const deleteAccountSchema = z
  .object({
    password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
    confirm: z.literal(DELETE_ACCOUNT_CONFIRM_PHRASE),
  })
  .strict();
/** Inferred input type of {@link deleteAccountSchema}. */
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
