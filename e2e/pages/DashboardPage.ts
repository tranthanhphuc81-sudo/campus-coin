/**
 * DashboardPage.ts
 * Page Object for the student home page (`/app`).
 * Exports: DashboardPage
 * Spec: docs/spec/05b §5.7 (dashboard)
 */
import { expect, type Page } from '@playwright/test';

export class DashboardPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/app');
    await expect(this.page).toHaveURL(/\/app$/);
  }

  async expectLoaded(): Promise<void> {
    await expect(this.page.getByRole('heading', { level: 1 })).toBeVisible();
  }
}
