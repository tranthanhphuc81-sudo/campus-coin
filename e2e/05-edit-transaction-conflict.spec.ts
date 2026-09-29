/**
 * 05-edit-transaction-conflict.spec.ts
 * Scenario 5 (P18, TC-12): editing a transaction is optimistic-locked (BR-TX-05). Two browser
 * contexts (simulating two tabs/devices signed in as the same student) open the SAME transaction's
 * edit drawer; the first save succeeds and bumps the version, the second save — still holding the
 * stale version it loaded before the first save — is rejected with a 409 and shows the dedicated
 * "changed elsewhere — reload?" banner instead of a generic form error.
 * Spec: docs/spec/05a §5.4.3 · Rules: BR-TX-05 (optimistic locking)
 *
 * Keeps two independent real UI logins (NOT `e2e/helpers/authFixtures.ts`'s worker-scoped session):
 * this scenario needs two *simultaneously live* sessions for the same student, and refresh tokens
 * are single-use and rotate per session (`backend/src/modules/sessions/session.service.ts`) — a
 * shared session/context would make both tabs race for the same one-time token and fail, whereas
 * two real logins genuinely are two independent rotation families, exactly like two real devices.
 */
import { expect, test } from '@playwright/test';
import { STUDENT_AN } from './helpers/demoAccounts.js';
import { LoginPage } from './pages/LoginPage.js';
import { TransactionsPage } from './pages/TransactionsPage.js';

test('a stale save loses to a concurrent edit with a 409 "changed elsewhere" banner', async ({ browser }) => {
  const description = `E2E Conflict Test ${Date.now()}`;

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    // ---- Setup: log both contexts in as the same student, create the shared transaction --------
    await new LoginPage(pageA).loginAsStudent(STUDENT_AN.email, STUDENT_AN.password);
    await new LoginPage(pageB).loginAsStudent(STUDENT_AN.email, STUDENT_AN.password);

    const transactionsA = new TransactionsPage(pageA);
    const transactionsB = new TransactionsPage(pageB);

    await transactionsA.goto();
    await transactionsA.quickAdd({ amount: '5.00', description, categoryLabel: 'Miscellaneous' });

    // ---- Both contexts open the SAME transaction's edit drawer (both hold the same version) -----
    await transactionsB.goto();
    await transactionsB.openRowEditor(description);

    await transactionsA.openRowEditor(description);

    // ---- Context A saves first — succeeds, bumps the version ------------------------------------
    await transactionsA.editOpenDrawerDescription(`${description} (A edited)`);
    await expect(pageA.getByText('Transaction updated.')).toBeVisible();

    // ---- Context B saves next — still holding the stale version, gets a 409 ---------------------
    await transactionsB.editOpenDrawerDescription(`${description} (B edited)`);
    await transactionsB.expectVersionConflictBanner();

    // Context A's edit is the one that actually stuck.
    await transactionsA.goto();
    await transactionsA.expectRowVisible(`${description} (A edited)`);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
