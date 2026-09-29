/**
 * RecurringRulesPage.ts
 * Page Object for the recurring rules list (`/app/transactions/recurring`) and its create/edit modal.
 * Exports: RecurringRulesPage
 * Spec: docs/spec/05a §5.4.2 (recurring transactions)
 */
import { expect, type Page } from '@playwright/test';

export interface RecurringRuleInput {
  amount: string;
  categoryLabel: string;
  description: string;
  dayOfMonth: string;
}

export class RecurringRulesPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/app/transactions/recurring');
    await expect(this.page).toHaveURL(/\/app\/transactions\/recurring$/);
  }

  async openCreate(): Promise<void> {
    // `.first()`: the PageHeader's own button AND the EmptyState's action button (shown when the
    // list is empty) render the exact same label at the same time — either click opens the modal.
    await this.page.getByRole('button', { name: '+ Add recurring rule' }).first().click();
    await expect(this.page.getByRole('dialog')).toBeVisible();
  }

  async create(input: RecurringRuleInput): Promise<void> {
    await this.openCreate();
    await this.page.getByLabel('Amount', { exact: true }).fill(input.amount);
    await this.page.getByLabel('Category', { exact: true }).selectOption({ label: input.categoryLabel });
    await this.page.getByLabel('Description', { exact: true }).fill(input.description);
    await this.page.getByLabel('Day of month').fill(input.dayOfMonth);
    await this.page.getByRole('button', { name: 'Create rule' }).click();
    await expect(this.page.getByText(input.description)).toBeVisible();
  }

  ruleCard(description: string) {
    return this.page.locator('.card', { hasText: description });
  }

  async pause(description: string): Promise<void> {
    await this.ruleCard(description).getByRole('button', { name: 'Pause' }).click();
    await expect(this.page.getByText('Recurring rule paused.')).toBeVisible();
  }

  async resume(description: string): Promise<void> {
    await this.ruleCard(description).getByRole('button', { name: 'Resume' }).click();
    await expect(this.page.getByText('Recurring rule resumed.')).toBeVisible();
  }

  async expectActive(description: string): Promise<void> {
    await expect(this.ruleCard(description).getByText('Active')).toBeVisible();
  }

  async expectPaused(description: string): Promise<void> {
    await expect(this.ruleCard(description).getByText('Paused')).toBeVisible();
  }
}
