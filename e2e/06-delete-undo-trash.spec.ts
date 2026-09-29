/**
 * 06-delete-undo-trash.spec.ts
 * Scenario 6 (P18): full transactions/categories E2E happy path for a freshly registered student:
 * create a custom category, quick-add a transaction using it, edit it, delete it, undo the delete
 * from the toast, delete it again and restore it from the Trash page instead.
 * Requires the backend API + worker + Mailpit reachable exactly like
 * `01-register-verify-login-onboarding.spec.ts` (see that file's header for the exact commands).
 * Spec: docs/spec/12 (testing plan – E2E) · docs/spec/05a §5.3, §5.4 (categories, transactions)
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { extractLink, waitForEmailBody } from './helpers/mailpit.js';
import { LoginPage } from './pages/LoginPage.js';
import { OnboardingPage } from './pages/OnboardingPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { TransactionsPage } from './pages/TransactionsPage.js';
import { TrashPage } from './pages/TrashPage.js';

/** Registers a fresh, verified student and logs in, skipping onboarding — leaves `page` on `/app`. */
async function registerLoggedInStudent(page: Page, request: APIRequestContext): Promise<string> {
  const email = `e2e-txn-${Date.now()}@example.com`;
  const password = 'Sup3r-Str0ng-Passw0rd-2026!';

  await new RegisterPage(page).register('E2E Transactions Student', email, password);

  const emailBody = await waitForEmailBody(request, email);
  const verifyUrl = new URL(extractLink(emailBody, '/verify-email'));
  await page.goto(verifyUrl.pathname + verifyUrl.search);
  await page.getByRole('link', { name: 'Go to log in' }).click();

  await new LoginPage(page).login(email, password);
  const onboarding = new OnboardingPage(page);
  await onboarding.expectStep1();
  await onboarding.skip();

  return email;
}

test('create a category, add/edit/delete a transaction, undo, and restore from Trash', async ({ page, request }) => {
  await registerLoggedInStudent(page, request);
  const categoryName = `E2E Category ${Date.now()}`;
  const transactionsPage = new TransactionsPage(page);
  const trashPage = new TrashPage(page);

  // ---- Create a custom category ------------------------------------------------------------
  await page.goto('/app/categories');
  // `.first()`: for a fresh student with no categories yet, the PageHeader's own button AND the
  // EmptyState's action button render the exact same label at the same time.
  await page.getByRole('button', { name: '+ Add category' }).first().click();
  await page.getByLabel('Name').fill(categoryName);
  await page.getByLabel('Type').selectOption('expense');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText(categoryName)).toBeVisible();

  // ---- Quick-add a transaction using it -----------------------------------------------------
  await transactionsPage.goto();
  await transactionsPage.quickAdd({ amount: '12.50', description: 'E2E test purchase', categoryLabel: categoryName });

  // ---- Edit it -------------------------------------------------------------------------------
  await transactionsPage.openRowEditor('E2E test purchase');
  await transactionsPage.editOpenDrawerDescription('E2E test purchase (edited)');
  await transactionsPage.expectRowVisible('E2E test purchase (edited)');

  // ---- Delete it, then undo -------------------------------------------------------------------
  await transactionsPage.deleteByDescription('E2E test purchase (edited)');
  await expect(page.getByText('Transaction deleted.')).toBeVisible();
  await transactionsPage.expectRowHidden('E2E test purchase (edited)');
  await transactionsPage.undoLastDelete();
  await transactionsPage.expectRowVisible('E2E test purchase (edited)');

  // ---- Delete it again, this time restore from the Trash page --------------------------------
  await transactionsPage.deleteByDescription('E2E test purchase (edited)');
  await transactionsPage.expectRowHidden('E2E test purchase (edited)');

  await trashPage.goto();
  await trashPage.restoreByDescription('E2E test purchase (edited)');

  await transactionsPage.goto();
  await transactionsPage.expectRowVisible('E2E test purchase (edited)');
});
