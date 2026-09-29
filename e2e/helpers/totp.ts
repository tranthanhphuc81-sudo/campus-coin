/**
 * totp.ts
 * Generates a current 6-digit TOTP code from a Base32 secret, for the demo admin's fixed
 * `DEMO_ADMIN_TOTP_SECRET` (`backend/prisma/seed/demo.ts`). Uses `otplib`'s functional API — the
 * exact same one `backend/src/lib/totp.ts` uses server-side — so a code generated here always
 * verifies. `otplib` is a backend dependency but resolves fine from `e2e/` too: npm workspaces
 * hoist it to the repo-root `node_modules`.
 * Main exports: DEMO_ADMIN_TOTP_SECRET, TOTP_PERIOD_MS, currentTotpCode
 * Spec: docs/spec/10 §11.5 (Bảng 65 – demo accounts) · docs/spec/09 §9.5 (admin MFA)
 */
import { generate } from 'otplib';

/**
 * Fixed demo admin TOTP secret (must match `DEMO_ADMIN_TOTP_SECRET` in
 * `backend/prisma/seed/demo.ts` — never a real secret, dev/demo data only).
 */
export const DEMO_ADMIN_TOTP_SECRET = 'QUQ7AGY6LOEOO37LX5Q75X3CQE366WUH';

/** otplib's default TOTP period (matches `backend/src/lib/totp.ts`'s `TOTP_PERIOD_SEC`). */
export const TOTP_PERIOD_MS = 30_000;

/** Returns the current 6-digit TOTP code for `secret` (valid ~30s). */
export async function currentTotpCode(secret: string = DEMO_ADMIN_TOTP_SECRET): Promise<string> {
  return generate({ secret });
}
