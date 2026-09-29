/**
 * LoginPage.ts
 * Page Object for the public login page (`/login`).
 * Exports: LoginPage
 * Spec: docs/spec/09 §9 (auth)
 */
import { expect, type Page } from '@playwright/test';

export class LoginPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/login');
  }

  /** Fills the form and submits, but does not wait for the post-login redirect. */
  async submit(email: string, password: string, rememberMe = false): Promise<void> {
    await this.page.getByLabel('Email address').fill(email);
    await this.page.getByLabel('Password', { exact: true }).fill(password);
    if (rememberMe) await this.page.getByRole('checkbox', { name: 'Remember me' }).check();
    await this.page.getByRole('button', { name: 'Log in' }).click();
  }

  /** Logs in and waits for the redirect away from `/login` (onboarding or the dashboard). */
  async login(email: string, password: string): Promise<void> {
    await this.goto();
    await this.submit(email, password);
    await expect(this.page).not.toHaveURL(/\/login$/, { timeout: 20_000 });
  }

  /**
   * Logs in a demo student and lands on `/app`. "Has completed onboarding" is tracked purely
   * client-side (`localStorage['cc.onboarding.<userId>']`, PROGRESS.md's 2026-09-27 P06 decision)
   * — every Playwright test starts from a brand-new browser context with empty storage, so even a
   * long-lived demo account with months of real data is routed to `/app/onboarding` on its very
   * first login in each test. Skip straight through it when that happens.
   */
  async loginAsStudent(email: string, password: string): Promise<void> {
    await this.goto();
    await this.submit(email, password);
    await this.page.waitForURL(/\/app(\/onboarding)?$/, { timeout: 20_000 });
    if (/\/app\/onboarding$/.test(this.page.url())) {
      await this.page.getByRole('button', { name: 'Skip for now' }).click();
    }
    await expect(this.page).toHaveURL(/\/app$/, { timeout: 15_000 });
  }

  async expectGenericError(): Promise<void> {
    await expect(this.page.getByRole('alert')).toBeVisible();
  }
}
