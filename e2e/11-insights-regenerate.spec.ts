/**
 * 11-insights-regenerate.spec.ts
 * Scenario 11 (P18): An's demo account has one seeded template-generated insight for the anchor
 * month. Clicking "Regenerate" on it shows a busy state and settles back to an enabled Regenerate
 * button once the new insight has been generated (works with `AI_API_KEY` empty via the
 * rule/template fallback — CLAUDE.md's AI golden rule).
 * Spec: docs/spec/05b §5.9 (monthly AI insights)
 *
 * Reuses An's worker-scoped session (`e2e/helpers/authFixtures.ts`) instead of a real UI login —
 * this spec is about regenerating insights, not login itself.
 */
import { expect, test } from './helpers/authFixtures.js';
import { InsightsPage } from './pages/InsightsPage.js';

test('regenerating the latest insight shows a busy state then settles', async ({ anPage: page }) => {
  const insightsPage = new InsightsPage(page);
  await insightsPage.goto();

  await expect(page.getByRole('heading', { name: 'AI Insights' })).toBeVisible();
  await expect(insightsPage.firstCard()).toBeVisible();

  await insightsPage.regenerateFirst();
  await insightsPage.expectGeneratingThenSettled();
});
