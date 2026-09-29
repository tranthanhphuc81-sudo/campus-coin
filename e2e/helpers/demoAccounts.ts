/**
 * demoAccounts.ts
 * Fixed demo account credentials seeded by `backend/prisma/seed/demo.ts` (`npm run db:seed -w
 * backend -- --demo`, also what `e2e/global-setup.ts` runs before the whole suite). Centralised
 * here instead of hardcoded per-spec so a future credential change is a one-line edit.
 * Main exports: DEMO_STUDENT_PASSWORD, DEMO_ADMIN, STUDENT_AN, STUDENT_BINH, STUDENT_CHI
 * Spec: docs/spec/10 §11.5 (Bảng 65 – demo accounts) · docs/spec/12 §12.3 (Bảng 69 – test datasets)
 */

/** Shared password for every demo student account. */
export const DEMO_STUDENT_PASSWORD = 'Student@Campus2026!';

/** Demo admin: fixed TOTP secret (see `helpers/totp.ts`), MFA already enrolled by the seed. */
export const DEMO_ADMIN = {
  email: 'admin@campuscoin.demo',
  password: 'Admin@Campus2026!',
};

/** An Nguyễn: 6 months of data, AI on, budgets + one seeded insight + 2 seeded tips. */
export const STUDENT_AN = {
  email: 'an.nguyen@campuscoin.demo',
  password: DEMO_STUDENT_PASSWORD,
};

/** Trần Thị Bình: 3 months, AI off, last-month Food/Entertainment spike, 4 recurring subscriptions. */
export const STUDENT_BINH = {
  email: 'binh.tran@campuscoin.demo',
  password: DEMO_STUDENT_PASSWORD,
};

/** Lê Thị Chi: empty account — onboarding / CSV import demos start from a clean slate. */
export const STUDENT_CHI = {
  email: 'chi.le@campuscoin.demo',
  password: DEMO_STUDENT_PASSWORD,
};
