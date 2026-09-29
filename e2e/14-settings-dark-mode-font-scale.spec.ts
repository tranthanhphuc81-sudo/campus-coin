/**
 * 14-settings-dark-mode-font-scale.spec.ts
 * Scenario 14 / TC-27 (P18): dark mode + 130% text size at a 375px phone width must not overflow
 * the viewport and must stay WCAG 2.2 AA (spec §8.5, §8.7). Runs under the `mobile-chromium`
 * Playwright project (375×812 — see `playwright.config.ts`), so no manual `setViewportSize` here;
 * running it under a desktop project too would just re-check the same toggles at a width the spec
 * doesn't require this scenario to cover.
 * Spec: docs/spec/08 §8.2 (theme), §8.7 (font scale) · docs/spec/12 §12 TC-27
 *
 * Reuses An's worker-scoped session (`e2e/helpers/authFixtures.ts`) instead of a real UI login —
 * this spec is about dark mode/font scale, not login itself.
 */
import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './helpers/authFixtures.js';
import { SettingsPage } from './pages/SettingsPage.js';

test('dark mode + 130% font at 375px: no horizontal overflow, no serious a11y violations', async ({ anPage: page }) => {
  const settingsPage = new SettingsPage(page);
  await settingsPage.goto();
  await settingsPage.setDarkMode();
  await settingsPage.setFontScale(130);

  // No horizontal scrollbar at this viewport, on the settings page itself...
  await assertNoHorizontalOverflow(page);

  // ...and also on the dashboard, the most widget-dense page in the app.
  await page.goto('/app');
  await assertNoHorizontalOverflow(page);

  const results = await new AxeBuilder({ page }).analyze();
  const seriousViolations = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  if (seriousViolations.length > 0) {
    console.log('TC-27 accessibility violations:', JSON.stringify(seriousViolations, null, 2));
  }
  expect(seriousViolations).toEqual([]);
});

/** Fails if the document is wider than the viewport (a real horizontal scrollbar/overflow bug). */
async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const { scrollWidth, viewportWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(viewportWidth);
}
