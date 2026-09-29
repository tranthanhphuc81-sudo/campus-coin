/**
 * maskEmail.ts
 * Masks an email's local part for the admin user list (docs/spec/05c §5.13: the list view only
 * ever shows a masked email; the single-user detail view is the only place the full address is
 * shown — CLAUDE.md data-minimisation).
 * Main exports: maskEmail
 * Spec: docs/spec/05c §5.13 · docs/spec/09 §9.8 (data minimisation)
 */

/**
 * Masks an email's local part, then a fixed `***`, then the domain unchanged (e.g.
 * `"annguyen@campuscoin.demo"` -> `"an***@campuscoin.demo"`). A local part of 3 characters or
 * fewer keeps only its first character (`"ab@x.com"` -> `"a***@x.com"`, `"abc@x.com"` ->
 * `"a***@x.com"`); a longer local part keeps its first 2 (`"abcd@x.com"` -> `"ab***@x.com"`).
 * Fix 6 (security-fix follow-up): the previous rule kept up to `min(2, length)` characters, which
 * left a 1-2 char local part fully unmasked (`"ab"` -> `"ab***"`, no masking at all).
 * @param email - A full, already-normalised email address.
 * @returns The masked email, or `email` unchanged when it has no `@` (defensive; should not happen
 *   for a value already stored as a `User.email`).
 */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at === -1) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const keepCount = local.length <= 3 ? 1 : 2;
  const keep = local.slice(0, Math.min(keepCount, local.length));
  return `${keep}***${domain}`;
}
