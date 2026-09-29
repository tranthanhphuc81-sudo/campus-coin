/**
 * tips.schema.ts
 * Local Zod param schema for the `UserTip.id` route param. `@campuscoin/shared`'s
 * `tipIdParamSchema` is deliberately a plain string (the frontend has no BigInt) — mirrors
 * `notifications.schema.ts`'s own `bigIntIdParamSchema` for the same reason: the route handler
 * needs the transformed `bigint` to query Prisma, so it validates with this local schema instead.
 * Main exports: bigIntIdParamSchema, BigIntIdParamInput
 * Spec: docs/spec/07 §7.1 (route params) · docs/spec/06 (user_tips.id is BIGINT)
 */
import { z } from 'zod';

/** Route param `{ id }` where `id` is a `UserTip.id` (BigInt primary key). */
export const bigIntIdParamSchema = z
  .object({ id: z.string().regex(/^\d{1,20}$/, 'Invalid id.').transform((value) => BigInt(value)) })
  .strict();
/** Inferred input type of {@link bigIntIdParamSchema}. */
export type BigIntIdParamInput = z.infer<typeof bigIntIdParamSchema>;
