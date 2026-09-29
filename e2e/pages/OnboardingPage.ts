/**
 * OnboardingPage.ts
 * Page Object for the 3-step post-first-login onboarding wizard (`/app/onboarding`).
 * Exports: OnboardingPage
 * Spec: docs/spec/08 §8.3 (onboarding UI)
 */
import { expect, type Page } from '@playwright/test';

export class OnboardingPage {
  constructor(private readonly page: Page) {}

  async expectStep1(): Promise<void> {
    await expect(this.page).toHaveURL(/\/app\/onboarding$/);
  }

  async skip(): Promise<void> {
    await this.page.getByRole('button', { name: 'Skip for now' }).click();
    await expect(this.page).toHaveURL(/\/app$/);
  }

  async fillAllowance(amount: string): Promise<void> {
    await this.page.getByLabel('Monthly allowance').fill(amount);
    await this.page.getByRole('button', { name: 'Next' }).click();
  }

  async fillSavingsGoal(amount: string): Promise<void> {
    await this.page.getByLabel('Monthly savings goal').fill(amount);
    await this.page.getByRole('button', { name: 'Next' }).click();
  }

  async finishWithAiOptIn(optIn: boolean): Promise<void> {
    const toggle = this.page.getByLabel('Enable AI category suggestions and insights');
    if ((await toggle.isChecked()) !== optIn) await toggle.click();
    await this.page.getByRole('button', { name: 'Finish' }).click();
    await expect(this.page).toHaveURL(/\/app$/);
  }
}
