/**
 * 09-csv-import.spec.ts
 * Scenario 9 (P18): CSV import wizard end-to-end on Chi's empty demo account (clean slate — no
 * pre-existing transactions to confuse the "did it import?" assertion). Upload -> the wizard
 * auto-maps the standard `date,amount,type,description,category` headers (`guessMapping` in
 * `backend/src/modules/imports/imports.parser.ts`) straight to the preview step -> select all valid
 * rows -> commit -> land on the Result step -> the imported transactions show up in the real list.
 * Spec: docs/spec/05a §5.5 (CSV import wizard)
 *
 * Reuses Chi's worker-scoped session (`e2e/helpers/authFixtures.ts`) instead of a real UI login —
 * this spec is about the CSV import wizard, not login itself.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from './helpers/authFixtures.js';
import { ImportWizardPage } from './pages/ImportWizardPage.js';
import { TransactionsPage } from './pages/TransactionsPage.js';

const FIXTURE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'sample-import.csv');

test('import a CSV file and see the transactions in the list', async ({ chiPage: page }) => {
  const wizard = new ImportWizardPage(page);
  await wizard.goto();
  await wizard.uploadFile(FIXTURE_PATH);
  await wizard.waitForPreview();

  await expect(page.getByText('Grocery run')).toBeVisible();

  await wizard.selectAllValid();
  await wizard.commit();
  await expect(page.getByText('5 transactions imported.')).toBeVisible();

  await wizard.viewTransactions();
  const transactionsPage = new TransactionsPage(page);
  await expect(page).toHaveURL(/\/app\/transactions$/);
  await transactionsPage.expectRowVisible('Grocery run');
  await transactionsPage.expectRowVisible('Freelance tutoring payment');
});
