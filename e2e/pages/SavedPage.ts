/**
 * SavedPage.ts
 * Page Object for the bookmarked tips/insights/reports page (`/app/saved`).
 * Exports: SavedPage
 * Spec: docs/spec/05c §5.12 (bookmarks)
 */
import { expect, type Page } from '@playwright/test';

export class SavedPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/app/saved');
    await expect(this.page).toHaveURL(/\/app\/saved$/);
  }

  rowContaining(text: string) {
    return this.page.locator('.card', { hasText: text });
  }

  async expectBookmarked(text: string): Promise<void> {
    await expect(this.rowContaining(text)).toBeVisible();
  }

  async remove(text: string): Promise<void> {
    await this.rowContaining(text).getByRole('button', { name: 'Remove' }).click();
    await this.page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
  }
}
