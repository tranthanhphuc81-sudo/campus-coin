/**
 * InsightsPage.ts
 * Page Object for the monthly AI insights page (`/app/insights`).
 * Exports: InsightsPage
 * Spec: docs/spec/05b §5.9 (monthly insights)
 */
import { expect, type Page } from '@playwright/test';

export class InsightsPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/app/insights');
    await expect(this.page).toHaveURL(/\/app\/insights$/);
  }

  /** The first (most recent) insight card in the timeline. */
  firstCard() {
    return this.page.locator('.card').first();
  }

  /**
   * Bookmarks the first (most recent) insight card via its "Save" note modal, no note. The success
   * toast is matched via `.toast` (Bootstrap's own class) rather than plain page text — "Saved"
   * also collides with the sidebar's "Saved" nav link.
   */
  async saveFirst(): Promise<void> {
    await this.firstCard().getByRole('button', { name: /^Save|Saved$/ }).click();
    await this.page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(this.page.locator('.toast', { hasText: 'Saved' })).toBeVisible();
  }

  async regenerateFirst(): Promise<void> {
    await this.firstCard().getByRole('button', { name: /Regenerate/ }).click();
  }

  async expectGeneratingThenSettled(): Promise<void> {
    // The button flips to "Regenerating…" while in flight, then back once the new insight lands.
    await expect(this.firstCard().getByRole('button', { name: /Regenerating|Regenerate/ })).toBeVisible();
    await expect(this.firstCard().getByRole('button', { name: 'Regenerate' })).toBeEnabled({ timeout: 30_000 });
  }
}
