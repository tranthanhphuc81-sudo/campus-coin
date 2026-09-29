/**
 * 12-tips-pin-dismiss.spec.ts
 * Scenario 12 (P18): An's demo account has 2 seeded tips for the anchor month (rendered from fixed
 * templates in `backend/prisma/seed/demo.ts`'s `seedAnInsightAndTips`: "Slow down on Food" and
 * "Pay yourself first"). Pins the first (shows the Pinned badge, never colour alone — spec §8.5) and
 * dismisses the second (removed from the list with a confirmation toast).
 * Spec: docs/spec/05b §5.10 (saving tips)
 *
 * Reuses An's worker-scoped session (`e2e/helpers/authFixtures.ts`) instead of a real UI login —
 * this spec is about pinning/dismissing tips, not login itself.
 */
import { expect, test } from './helpers/authFixtures.js';
import { TipsPage } from './pages/TipsPage.js';

test('pin one tip and dismiss another', async ({ anPage: page }) => {
  const tipsPage = new TipsPage(page);
  await tipsPage.goto();

  await expect(page.getByText('Slow down on Food')).toBeVisible();
  await expect(page.getByText('Pay yourself first')).toBeVisible();

  await tipsPage.pin('Slow down on Food');
  await tipsPage.expectPinnedBadge('Slow down on Food');

  await tipsPage.dismiss('Pay yourself first');
  await expect(page.getByText('Pay yourself first')).not.toBeVisible();
});
