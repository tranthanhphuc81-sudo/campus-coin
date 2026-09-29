/**
 * 08-budget-alerts.spec.ts
 * Scenario 8 (P18, TC-20-ish): An's demo account has a seeded $90 Food budget for the current month
 * — her randomly-generated Food spending this month is already well above that (deliberately: budget
 * alerts are event-driven off real transactions, and the seed inserts rows directly, bypassing the
 * event bus entirely, so no alert has fired yet). Adding one more Food expense through the real UI
 * fires the `transaction.created` event, `budget-alert.handler.ts` recomputes consumption, and — since
 * it's already >=100% — raises a "Budget exceeded" notification, pushed live over SSE and shown as a
 * toast (`useNotificationStream`) plus a new row in the notification bell.
 * Spec: docs/spec/05c §5.11 (budgets & alerts) · Rules: BR-BU-04
 *
 * Reuses An's worker-scoped session (`e2e/helpers/authFixtures.ts`) instead of a real UI login —
 * this spec is about budget alerts, not login itself.
 */
import { expect, test } from './helpers/authFixtures.js';
import { TransactionsPage } from './pages/TransactionsPage.js';

test('an over-budget category raises a live "Budget exceeded" alert', async ({ anPage: page }) => {
  const transactionsPage = new TransactionsPage(page);
  await transactionsPage.goto();
  await transactionsPage.quickAdd({
    amount: '15.00',
    description: `E2E budget trigger ${Date.now()}`,
    categoryLabel: 'Food',
  });

  // Pushed live via SSE as a toast, and also lands in the notification bell dropdown. `.first()`:
  // An's account already carries other over-threshold categories from earlier in this suite (or
  // from this same test's own retries against the shared demo account), so more than one
  // "Budget exceeded" toast/row can legitimately be on screen at once — this only needs to prove
  // at least one fired for this action, not count them.
  await expect(page.getByText('Budget exceeded').first()).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: /Notifications/ }).click();
  await expect(page.getByRole('button', { name: /Budget exceeded/ }).first()).toBeVisible();
});
