/**
 * smoke.spec.ts
 * E2E smoke test: the home page loads and shows the real landing page hero heading.
 * Spec: docs/spec/12 (testing plan – E2E)
 */
import { expect, test } from '@playwright/test';

test('home page shows the landing page hero heading', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('CampusCoin');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Take control of your student budget' }),
  ).toBeVisible();
});
