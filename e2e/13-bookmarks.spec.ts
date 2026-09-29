/**
 * 13-bookmarks.spec.ts
 * Scenario 13 (P18): bookmarking a tip and a report view both show up on the Saved page
 * (`/app/saved`), and removing one takes it back off the list. Uses the "Slow down on Food" tip
 * (rather than "Pay yourself first", which `12-tips-pin-dismiss.spec.ts` dismisses on the same
 * shared An demo account) to stay independent of that spec's ordering.
 * Spec: docs/spec/05c §5.12 (bookmarks)
 *
 * Reuses An's worker-scoped session (`e2e/helpers/authFixtures.ts`) instead of a real UI login —
 * this spec is about bookmarks, not login itself.
 */
import { expect, test } from './helpers/authFixtures.js';
import { ReportsPage } from './pages/ReportsPage.js';
import { SavedPage } from './pages/SavedPage.js';
import { TipsPage } from './pages/TipsPage.js';

test('bookmark a tip and a report, see both on Saved, then remove one', async ({ anPage: page }) => {
  const tipsPage = new TipsPage(page);
  await tipsPage.goto();
  await tipsPage.save('Slow down on Food');

  const reportsPage = new ReportsPage(page);
  await reportsPage.goto();
  await reportsPage.bookmarkReport();

  const savedPage = new SavedPage(page);
  await savedPage.goto();
  await savedPage.expectBookmarked('Slow down on Food');
  // The overview view's bookmark label falls back to the generic "Reports" (see
  // `describeReportRef`'s default case) since it carries no distinguishing view name. Scoped to
  // the bookmark row's own heading — the student layout's own nav also has a "Reports" link on
  // every page.
  await expect(savedPage.rowContaining('Reports').getByRole('heading', { name: 'Reports' })).toBeVisible();

  await savedPage.remove('Slow down on Food');
  await expect(page.getByText('Removed from saved.')).toBeVisible();
});
