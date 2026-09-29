/**
 * ReportsPage.ts
 * Page Object for the `/app/reports/*` tabs and their shared export/share bar (`ReportsLayout`).
 * Exports: ReportsPage
 * Spec: docs/spec/05b §5.8 (reports)
 */
import { expect, type Download, type Page } from '@playwright/test';

export class ReportsPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/app/reports');
    await expect(this.page).toHaveURL(/\/app\/reports$/);
  }

  async gotoByCategory(): Promise<void> {
    await this.page.goto('/app/reports/by-category');
  }

  async gotoForecast(): Promise<void> {
    await this.page.goto('/app/reports/forecast');
  }

  /** Clicks "Export PDF" and returns the resulting download. */
  async exportPdf(): Promise<Download> {
    const [download] = await Promise.all([
      this.page.waitForEvent('download'),
      this.page.getByRole('button', { name: 'Export PDF' }).click(),
    ]);
    return download;
  }

  /**
   * Opens the "Save this report" bookmark note modal and submits it with no note. The success
   * toast is matched via `.toast` (Bootstrap's own class) rather than plain page text — "Saved"
   * also collides with the sidebar's "Saved" nav link.
   */
  async bookmarkReport(): Promise<void> {
    await this.page.getByRole('button', { name: 'Save this report' }).click();
    await this.page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(this.page.locator('.toast', { hasText: 'Saved' })).toBeVisible();
  }
}
