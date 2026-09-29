/**
 * TrashPage.ts
 * Page Object for the soft-deleted transactions page (`/app/transactions/trash`).
 * Exports: TrashPage
 * Spec: docs/spec/05a §5.4 · Rules: BR-TX-07
 */
import { expect, type Page } from '@playwright/test';

export class TrashPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/app/transactions/trash');
  }

  async restoreByDescription(description: string): Promise<void> {
    const row = this.page.locator('li', { hasText: description }).first();
    await row.getByRole('button', { name: 'Restore' }).click();
    await expect(this.page.getByText('Transaction restored.')).toBeVisible();
  }
}
