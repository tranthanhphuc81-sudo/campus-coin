/**
 * RegisterPage.ts
 * Page Object for the public register page (`/register`).
 * Exports: RegisterPage
 * Spec: docs/spec/05a §5.1.1 (register + verify)
 */
import { expect, type Page } from '@playwright/test';

export class RegisterPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/register');
  }

  /** Fills every field and submits; waits for the "Check your email" confirmation. */
  async register(fullName: string, email: string, password: string): Promise<void> {
    await this.goto();
    await this.page.getByLabel('Full name').fill(fullName);
    await this.page.getByLabel('Email address').fill(email);
    await this.page.getByLabel('Password', { exact: true }).fill(password);
    await this.page.getByRole('checkbox', { name: /I agree to the/ }).check();
    await this.page.getByRole('button', { name: 'Create account' }).click();
    await expect(this.page.getByText('Check your email')).toBeVisible();
  }
}
