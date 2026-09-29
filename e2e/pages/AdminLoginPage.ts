/**
 * AdminLoginPage.ts
 * Page Object for the standalone admin login page (`/admin/login`): password step, then TOTP.
 * Exports: AdminLoginPage
 * Spec: docs/spec/09 §9.5 (admin MFA login)
 */
import { expect, type Page } from '@playwright/test';
import { currentTotpCode, TOTP_PERIOD_MS } from '../helpers/totp.js';

export class AdminLoginPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/admin/login');
  }

  /**
   * Full 2-step login (password, then a freshly generated TOTP code) for an already-enrolled admin.
   *
   * Retries the TOTP step up to 3 times, each time waiting for a fresh 30-second time step before
   * generating a new code: `verifyTotp`'s replay guard (`backend/src/lib/totp.ts`) rejects a time
   * step already used by this account, and since every spec that needs an admin session shares the
   * one fixed demo admin secret, two admin logins landing in the same 30s window under Playwright's
   * parallel workers would otherwise collide (the 2nd genuinely correct code gets rejected as a
   * replay, not because it was wrong).
   */
  async login(email: string, password: string, totpSecret: string): Promise<void> {
    await this.goto();
    await this.page.getByLabel('Email address').fill(email);
    await this.page.getByLabel('Password', { exact: true }).fill(password);
    await this.page.getByRole('button', { name: 'Continue' }).click();

    const codeInput = this.page.getByLabel('6-digit code');
    await expect(codeInput).toBeVisible({ timeout: 10_000 });

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await codeInput.fill(await currentTotpCode(totpSecret));
      await this.page.getByRole('button', { name: 'Verify' }).click();

      const succeeded = await Promise.race([
        this.page.waitForURL(/\/admin$/, { timeout: 8_000 }).then(() => true),
        this.page.getByRole('alert').waitFor({ state: 'visible', timeout: 8_000 }).then(() => false),
      ]).catch(() => false);

      if (succeeded) return;
      if (attempt === maxAttempts) break;
      // Wait out only the REST of the current 30s time step (not a flat 30s) so the next generated
      // code is guaranteed fresh, without wasting the caller's test timeout budget more than needed.
      const msIntoStep = Date.now() % TOTP_PERIOD_MS;
      await this.page.waitForTimeout(TOTP_PERIOD_MS - msIntoStep + 500);
    }
    await expect(this.page).toHaveURL(/\/admin$/, { timeout: 15_000 });
  }
}
