/**
 * notifications.schema.ts
 * Local Zod param schema for the `Notification.id` route param. `shared/src/schemas/common.ts`'s
 * `intIdParamSchema` runs the matched digits through `Number(...)`, which loses precision above
 * `Number.MAX_SAFE_INTEGER` — unsafe for a `BigInt` primary key. This module defines its own
 * `{ id: bigint }` param schema instead of reusing it.
 * Main exports: bigIntIdParamSchema, BigIntIdParamInput
 * Spec: docs/spec/07 §7.1 (route params) · docs/spec/06 (notifications.id is BIGINT)
 */
import { z } from 'zod';

/** Route param `{ id }` where `id` is a `Notification.id` (BigInt primary key). */
export const bigIntIdParamSchema = z
  .object({ id: z.string().regex(/^\d{1,20}$/, 'Invalid id.').transform((value) => BigInt(value)) })
  .strict();
/** Inferred input type of {@link bigIntIdParamSchema}. */
export type BigIntIdParamInput = z.infer<typeof bigIntIdParamSchema>;
