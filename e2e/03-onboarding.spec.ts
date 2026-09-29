/**
 * 03-onboarding.spec.ts
 * Scenario 3 (P18): the first-ever login for a browser profile routes to `/app/onboarding`
 * (`LoginPage`'s `hasCompletedOnboarding` check, PROGRESS.md P06); walks through all 3 steps
 * (allowance, savings goal, AI opt-in) with real values instead of skipping, and confirms the
 * final `PATCH /me` actually applied by checking the dashboard renders afterwards. Uses Chi's
 * empty demo account (clean slate, no pre-existing data to confuse the "first login" check).
 * Spec: docs/spec/08 §8.3 (onboarding UI) · docs/spec/05a §5.2 (profile fields)
 */
import { expect, test } from '@playwright/test';
import { STUDENT_CHI } from './helpers/demoAccounts.js';
import { LoginPage } from './pages/LoginPage.js';
import { OnboardingPage } from './pages/OnboardingPage.js';

test('first login walks a student through the 3-step onboarding wizard', async ({ page }) => {
  // Each Playwright test gets a fresh browser context (no shared localStorage), so this demo
  // account's `cc.onboarding.<userId>` flag is guaranteed unset here regardless of prior runs.
  const loginPage = new LoginPage(page);
  await loginPage.login(STUDENT_CHI.email, STUDENT_CHI.password);

  const onboarding = new OnboardingPage(page);
  await onboarding.expectStep1();
  await expect(page.getByText('Step 1 of 3')).toBeVisible();

  await onboarding.fillAllowance('300');
  await expect(page.getByText('Step 2 of 3')).toBeVisible();

  await onboarding.fillSavingsGoal('50');
  await expect(page.getByText('Step 3 of 3')).toBeVisible();

  await onboarding.finishWithAiOptIn(true);
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText("You're all set!")).toBeVisible();

  // A second login for the same browser profile must NOT show onboarding again.
  await page.getByRole('button', { name: 'Log Out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await loginPage.loginAsStudent(STUDENT_CHI.email, STUDENT_CHI.password);
});
