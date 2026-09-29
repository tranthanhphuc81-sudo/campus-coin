/**
 * register-verify-login-onboarding.spec.ts
 * Scenario 1 (P18): full auth E2E happy path: register -> fetch the verification link from
 * Mailpit's API -> verify the email -> log in -> skip through onboarding -> land on the dashboard.
 * Requires the backend API (`npm run dev -w @campuscoin/backend`) and worker
 * (`npm run worker -w backend`) reachable through the frontend's `/api` proxy, and Mailpit
 * (`docker compose up -d`) at MAILPIT_URL (default http://localhost:8025) so the verification
 * email the backend queues actually gets delivered somewhere this test can read it back from.
 * Spec: docs/spec/12 (testing plan – E2E) · docs/spec/05a §5.1.1 (register + verify)
 */
import { expect, test } from '@playwright/test';
import { extractLink, waitForEmailBody } from './helpers/mailpit.js';
import { LoginPage } from './pages/LoginPage.js';
import { OnboardingPage } from './pages/OnboardingPage.js';
import { RegisterPage } from './pages/RegisterPage.js';

test('register, verify email, log in, complete onboarding, reach the dashboard', async ({ page, request }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = 'Sup3r-Str0ng-Passw0rd-2026!';

  const registerPage = new RegisterPage(page);
  const loginPage = new LoginPage(page);
  const onboardingPage = new OnboardingPage(page);

  // ---- Register ---------------------------------------------------------------------------
  await registerPage.register('E2E Test Student', email, password);

  // ---- Verify email (link fetched from Mailpit, never typed by a human) -------------------
  const emailBody = await waitForEmailBody(request, email);
  const verifyUrl = new URL(extractLink(emailBody, '/verify-email'));
  await page.goto(verifyUrl.pathname + verifyUrl.search);

  await expect(page.getByText('Your email has been verified. You can now sign in.')).toBeVisible();
  await page.getByRole('link', { name: 'Go to log in' }).click();
  await expect(page).toHaveURL(/\/login$/);

  // ---- Log in -------------------------------------------------------------------------------
  await loginPage.login(email, password);
  // First-ever login for this browser profile -> onboarding, not the dashboard directly.
  await onboardingPage.expectStep1();

  // ---- Onboarding: skip straight through (values are optional, BR: skippable) --------------
  await onboardingPage.skip();
});
