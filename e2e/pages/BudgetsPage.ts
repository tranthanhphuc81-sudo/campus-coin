/**
 * BudgetsPage.ts
 * Page Object for the student budgets page (`/app/budgets`).
 * Exports: BudgetsPage
 * Spec: docs/spec/05c §5.11 (budgets & alerts)
 */
import { expect, type Page } from '@playwright/test';

export class BudgetsPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/app/budgets');
    await expect(this.page).toHaveURL(/\/app\/budgets$/);
  }

  /** The category card for `categoryName`, containing its limit/threshold inputs and progress bar. */
  categoryCard(categoryName: string) {
    return this.page.locator('.card', { hasText: categoryName });
  }

  async setLimit(categoryName: string, limitAmount: string): Promise<void> {
    await this.categoryCard(categoryName).getByLabel('Monthly limit').fill(limitAmount);
  }

  async save(): Promise<void> {
    await this.page.getByRole('button', { name: 'Save budgets' }).click();
    await expect(this.page.getByText('Budgets saved.')).toBeVisible();
  }
}
