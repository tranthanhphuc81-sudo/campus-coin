/**
 * 07-recurring-rule.spec.ts
 * Scenario 7 (P18): Bình's demo account has 4 seeded monthly subscriptions
 * (`backend/prisma/seed/demo.ts`'s `BINH_SUBSCRIPTIONS`) — verifies they render correctly (amount,
 * next-run date) and exercises pause/resume on one of them; then creates a brand-new recurring rule
 * from scratch on An's account to cover the create flow too.
 * Spec: docs/spec/05a §5.4.2 (recurring transactions)
 *
 * Uses the matching account's worker-scoped session (`e2e/helpers/authFixtures.ts`) instead of a
 * real UI login — this spec is about recurring rules, not login itself.
 */
import { expect, test } from './helpers/authFixtures.js';
import { RecurringRulesPage } from './pages/RecurringRulesPage.js';

test('seeded recurring subscriptions render and can be paused/resumed', async ({ binhPage: page }) => {
  const recurringPage = new RecurringRulesPage(page);
  await recurringPage.goto();

  await expect(page.getByText('Netflix subscription')).toBeVisible();
  await expect(page.getByText('Spotify subscription')).toBeVisible();
  await recurringPage.expectActive('Netflix subscription');

  await recurringPage.pause('Netflix subscription');
  await recurringPage.expectPaused('Netflix subscription');

  await recurringPage.resume('Netflix subscription');
  await recurringPage.expectActive('Netflix subscription');
});

test('creating a new recurring rule shows it in the list', async ({ anPage: page }) => {
  const recurringPage = new RecurringRulesPage(page);
  await recurringPage.goto();

  const description = `E2E gym membership ${Date.now()}`;
  await recurringPage.create({ amount: '20.00', categoryLabel: 'Miscellaneous', description, dayOfMonth: '5' });
  await recurringPage.expectActive(description);
});
