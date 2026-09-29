/**
 * 04-quick-add-ai-category.spec.ts
 * Scenario 4 (P18): quick-adding a transaction with a recognisable description shows an AI category
 * suggestion chip next to the Category field, and clicking it fills the category picker. Works
 * identically whether `AI_API_KEY` is configured or empty — with no key the backend's rule/keyword
 * fallback still returns a suggestion (CLAUDE.md's AI golden rule) — so this only asserts that SOME
 * suggestion chip appears for a well-known keyword ("bus", also present in the P02 keyword
 * dictionary, `backend/prisma/seed/data/keywords.v1.json`), never a specific category.
 * Spec: docs/spec/05a §5.4.1 (quick-add form) · CLAUDE.md "AI" invariant
 *
 * Reuses An's worker-scoped session (`e2e/helpers/authFixtures.ts`) instead of a real UI login —
 * this spec is about the AI suggestion chip, not login itself, so it starts already authenticated.
 */
import { expect, test } from './helpers/authFixtures.js';
import { TransactionsPage } from './pages/TransactionsPage.js';

test('quick-add shows an AI category suggestion chip that can be applied', async ({ anPage: page }) => {
  const transactionsPage = new TransactionsPage(page);
  await transactionsPage.goto();
  await transactionsPage.openQuickAdd();

  // `{ exact: true }`: the list's filter bar (e.g. "Min amount", "Categories") stays mounted
  // behind the modal, and `getByLabel` matches by substring by default.
  await page.getByLabel('Amount', { exact: true }).fill('2.50');
  await page.getByLabel('Description', { exact: true }).fill('Bus ticket to campus');

  const chip = transactionsPage.aiSuggestionChip();
  await expect(chip).toBeVisible({ timeout: 10_000 });

  const categorySelect = page.getByLabel('Category', { exact: true });
  await chip.click();
  await expect(categorySelect).not.toHaveValue('');

  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  // `.first()`: the desktop table and the mobile card list both render the description at once.
  await expect(page.getByText('Bus ticket to campus').first()).toBeVisible();
});
