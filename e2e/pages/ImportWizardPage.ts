/**
 * ImportWizardPage.ts
 * Page Object for the CSV import wizard (`/app/transactions/import`): Upload -> Map & preview ->
 * Result.
 * Exports: ImportWizardPage
 * Spec: docs/spec/05a §5.5 (CSV import wizard)
 */
import path from 'node:path';
import { expect, type Page } from '@playwright/test';

export class ImportWizardPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/app/transactions/import');
    await expect(this.page).toHaveURL(/\/app\/transactions\/import$/);
  }

  /** Uploads `filePath` via the hidden file input (works across Chromium/Firefox/WebKit). */
  async uploadFile(filePath: string): Promise<void> {
    await this.page.getByLabel('Choose file').setInputFiles(path.resolve(filePath));
  }

  /**
   * Waits for the Map & Preview step's summary line to render (`frontend/src/i18n/en.ts`'s
   * `summary(valid, total)`: "`${valid} of ${total} rows are ready to import.`"). Matches on the
   * stable trailing phrase only — bug found while wiring up P18's storageState reuse: the previous
   * regex (`/rows? ready to import|valid rows?/i`) required "rows" to be followed directly by
   * "ready", so it never actually matched this sentence's "rows ARE ready to import" and only ever
   * passed by coincidentally matching the unrelated "Select all valid rows" button's text instead.
   */
  async waitForPreview(): Promise<void> {
    await expect(this.page.getByText(/ready to import/i).first()).toBeVisible({ timeout: 20_000 });
  }

  async selectAllValid(): Promise<void> {
    await this.page.getByRole('button', { name: 'Select all valid rows' }).click();
  }

  async commit(): Promise<void> {
    await this.page.getByRole('button', { name: /^Import \d+ transactions?$/ }).click();
    await expect(this.page.getByText('Import complete')).toBeVisible({ timeout: 20_000 });
  }

  async viewTransactions(): Promise<void> {
    await this.page.getByRole('link', { name: 'View transactions' }).click();
  }
}
