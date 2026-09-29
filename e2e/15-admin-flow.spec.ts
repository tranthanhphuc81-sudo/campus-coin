/**
 * 15-admin-flow.spec.ts
 * Scenario 15 (P18): admin login (password + TOTP, using the demo admin's fixed, already-enrolled
 * secret), view the users list, open a student's detail drawer, disable then re-enable it. Uses a
 * throwaway student registered fresh via the API (`registerStudentViaApi`) rather than one of the 5
 * fixed demo accounts other specs depend on, so this spec can never corrupt their fixtures.
 * Spec: docs/spec/05c §5.13 (admin users) · docs/spec/09 §9.5 (admin MFA login)
 */
import { expect, test } from '@playwright/test';
import { registerStudentViaApi } from './helpers/apiRegister.js';
import { DEMO_ADMIN } from './helpers/demoAccounts.js';
import { DEMO_ADMIN_TOTP_SECRET } from './helpers/totp.js';
import { AdminLoginPage } from './pages/AdminLoginPage.js';
import { AdminUsersPage } from './pages/AdminUsersPage.js';

test('admin logs in with TOTP, finds a user, disables then re-enables it', async ({ page, request, baseURL }) => {
  // AdminLoginPage.login retries up to 3 times, ~30s apart, if a shared-secret TOTP time-step
  // collides with another parallel worker's admin login — comfortably over the 30s test default.
  test.setTimeout(90_000);
  const student = await registerStudentViaApi(request, baseURL!);

  await new AdminLoginPage(page).login(DEMO_ADMIN.email, DEMO_ADMIN.password, DEMO_ADMIN_TOTP_SECRET);

  const adminUsersPage = new AdminUsersPage(page);
  await adminUsersPage.goto();
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();

  await adminUsersPage.search(student.email);
  await adminUsersPage.openRow(student.fullName);
  // Scoped to the open detail drawer: the status filter's own <option> and the (possibly several,
  // from repeated runs of this spec) other pending rows behind it also contain this text.
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByText(student.email)).toBeVisible();
  await expect(drawer.getByText('Pending')).toBeVisible();

  await adminUsersPage.disable();
  await expect(page.getByText('User disabled.')).toBeVisible();
  await expect(drawer.getByText('Disabled', { exact: true })).toBeVisible();

  await adminUsersPage.enable();
  await expect(page.getByText('User enabled.')).toBeVisible();
});
