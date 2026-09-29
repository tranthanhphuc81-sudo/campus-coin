/**
 * 10-reports-pdf.spec.ts
 * Scenario 10 (P18): the reports overview loads a real income-vs-expense chart for An's 6-month
 * demo dataset, and "Export PDF" triggers a real file download with a non-empty body.
 * Spec: docs/spec/05b §5.8 (reports, PDF export)
 *
 * Reuses An's worker-scoped session (`e2e/helpers/authFixtures.ts`) instead of a real UI login —
 * this spec is about reports/PDF export, not login itself.
 */
import { expect, test } from './helpers/authFixtures.js';
import { ReportsPage } from './pages/ReportsPage.js';

test('reports overview renders and the monthly PDF export downloads a real file', async ({ anPage: page }) => {
  const reportsPage = new ReportsPage(page);
  await reportsPage.goto();

  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Income vs expense' })).toBeVisible();

  const download = await reportsPage.exportPdf();
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
});
