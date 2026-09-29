/**
 * TipsPage.ts
 * Page Object for the saving tips page (`/app/tips`).
 * Exports: TipsPage
 * Spec: docs/spec/05b §5.10 (saving tips)
 */
import { expect, type Page } from '@playwright/test';

export class TipsPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/app/tips');
    await expect(this.page).toHaveURL(/\/app\/tips$/);
  }

  tipCard(title: string) {
    return this.page.locator('.card', { hasText: title });
  }

  async pin(title: string): Promise<void> {
    await this.tipCard(title).getByRole('button', { name: 'Pin', exact: true }).click();
  }

  async unpin(title: string): Promise<void> {
    await this.tipCard(title).getByRole('button', { name: 'Unpin', exact: true }).click();
  }

  async dismiss(title: string): Promise<void> {
    await this.tipCard(title).getByRole('button', { name: 'Dismiss' }).click();
    await expect(this.page.getByText('Tip dismissed for 30 days.')).toBeVisible();
  }

  /**
   * Bookmarks the tip: opens the "Save" note modal and submits it with no note. The success toast
   * is matched via `.toast` (Bootstrap's own class, `ToastProvider.tsx`) rather than plain page
   * text — "Saved" also collides with the sidebar's "Saved" nav link and the bookmark button's own
   * post-save label.
   */
  async save(title: string): Promise<void> {
    await this.tipCard(title).getByRole('button', { name: /^Save|Saved$/ }).click();
    await this.page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(this.page.locator('.toast', { hasText: 'Saved' })).toBeVisible();
  }

  async expectPinnedBadge(title: string): Promise<void> {
    await expect(this.tipCard(title).getByText('Pinned')).toBeVisible();
  }
}
