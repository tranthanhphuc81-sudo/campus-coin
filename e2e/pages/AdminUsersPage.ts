/**
 * AdminUsersPage.ts
 * Page Object for the admin user management page (`/admin/users`) and its detail drawer.
 * Exports: AdminUsersPage
 * Spec: docs/spec/05c §5.13 (admin users)
 */
import { expect, type Page } from '@playwright/test';

export class AdminUsersPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/admin/users');
    await expect(this.page).toHaveURL(/\/admin\/users$/);
  }

  async search(query: string): Promise<void> {
    await this.page.getByLabel('Search').fill(query);
  }

  async openRow(text: string): Promise<void> {
    const row = this.page.locator('tbody tr', { hasText: text }).first();
    // The search box is debounced (300ms) before the list re-fetches — wait for the row to
    // actually appear rather than racing a click against the still-in-flight query.
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.click();
    await expect(this.page.getByRole('heading', { name: 'User details' })).toBeVisible();
  }

  async disable(): Promise<void> {
    await this.page.getByRole('button', { name: 'Disable', exact: true }).click();
    // Both the still-open detail drawer (an Offcanvas) and the confirm modal expose `role="dialog"`
    // — scope to the confirm modal by its own unique title so this never hits a strict-mode
    // "2 elements match" error.
    const confirmDialog = this.page.getByRole('dialog').filter({ hasText: 'Disable this user?' });
    await confirmDialog.getByRole('button', { name: 'Disable', exact: true }).click();
  }

  async enable(): Promise<void> {
    await this.page.getByRole('button', { name: 'Enable', exact: true }).click();
    const confirmDialog = this.page.getByRole('dialog').filter({ hasText: 'Enable this user?' });
    await confirmDialog.getByRole('button', { name: 'Enable', exact: true }).click();
  }
}
