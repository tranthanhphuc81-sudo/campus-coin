/**
 * 02-login-logout.spec.ts
 * Scenario 2 (P18): log in as a seeded demo student, land on the dashboard, then log out and land
 * back on the public landing page with the session cleared (a direct `/app` visit afterwards
 * redirects to `/login`).
 * Requires the demo dataset (`npm run db:seed -w backend -- --demo`, run automatically by
 * `e2e/global-setup.ts`) and the backend API reachable through the frontend's `/api` proxy.
 * Spec: docs/spec/09 §9 (auth) · docs/spec/12 (testing plan – E2E)
 */
import { expect, test } from '@playwright/test';
import { STUDENT_AN } from './helpers/demoAccounts.js';
import { LoginPage } from './pages/LoginPage.js';

test('log in as a demo student and log out', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.loginAsStudent(STUDENT_AN.email, STUDENT_AN.password);

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await page.getByRole('button', { name: 'Log Out' }).click();
  await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 });

  // The session is really gone — a direct visit to a protected route bounces back to /login.
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login$/);
});

test('a wrong password shows one generic error (never reveals which field was wrong)', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.submit(STUDENT_AN.email, 'definitely-the-wrong-password-123');
  await loginPage.expectGenericError();
  await expect(page).toHaveURL(/\/login$/);
});
