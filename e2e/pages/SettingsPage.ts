/**
 * SettingsPage.ts
 * Page Object for the "Appearance" tab of Profile & Settings (`/app/profile`): colour theme and
 * font-scale controls, both backed by `ThemeProvider`.
 * Exports: SettingsPage
 * Spec: docs/spec/08 §8.2 (theme), §8.7 (accessibility font scale)
 */
import { expect, type Page } from '@playwright/test';

export class SettingsPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/app/profile');
    await this.page.getByRole('tab', { name: 'Appearance' }).click();
  }

  /**
   * Clicks the theme toggle (cycles Light -> Dark -> System) until it reports Dark mode. `.first()`:
   * the layout's own header chrome and the Appearance tab's content each render their own
   * `<ThemeToggle>` — both are bound to the same shared `useTheme()` state, so clicking either one
   * has the identical effect.
   */
  async setDarkMode(): Promise<void> {
    const toggle = this.page.getByRole('button', { name: /Toggle colour theme/ }).first();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const label = await toggle.getAttribute('aria-label');
      if (label?.includes('Dark')) return;
      await toggle.click();
    }
    await expect(toggle).toHaveAttribute('aria-label', /Dark/);
  }

  /**
   * Sets the font-scale to the given percentage (90/100/115/130). `.first()`: like `ThemeToggle`,
   * the layout's own header chrome and the Appearance tab's content each render their own
   * `<FontSizeControl>`, both bound to the same shared `useTheme()` state.
   */
  async setFontScale(percent: 90 | 100 | 115 | 130): Promise<void> {
    const button = this.page.getByRole('button', { name: `${percent}%`, exact: true }).first();
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
  }
}
