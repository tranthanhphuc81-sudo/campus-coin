/**
 * users.schema.ts
 * Backend-only Zod schemas for `/api/v1/me/*` that don't belong in `shared/` (route params, not
 * shared with a frontend form). Body schemas (`updateProfileSchema`, `changePasswordSchema`) come
 * from `@campuscoin/shared`.
 * Main exports: sessionIdParamSchema
 * Spec: docs/spec/07 §7.3.1 (users/me) · docs/spec/09 §9.5 (sessions)
 */
import { z } from 'zod';

/** Route param of `DELETE /me/sessions/:id` — the session (family) id, a UUID. */
export const sessionIdParamSchema = z.object({ id: z.uuid('Malformed session id.') }).strict();
/** Inferred input type of {@link sessionIdParamSchema}. */
export type SessionIdParamInput = z.infer<typeof sessionIdParamSchema>;
