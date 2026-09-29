/**
 * accessibility.spec.ts
 * axe-core scan (WCAG 2.2 AA target, spec §8.5) of the landing, login, dashboard, transactions,
 * reports, settings and admin-users pages, in BOTH light and dark mode: fails on any
 * `serious`/`critical` violation. Runs under both the `chromium` (1280×800) and `mobile-chromium`
 * (375×812) Playwright projects (see `playwright.config.ts`), so every page×mode combination is
 * checked at both viewports named in docs/spec/10 §11.6 Bảng 66.
 *
 * Dark mode is forced via `localStorage['cc.theme'] = 'dark'` (the exact key/value `ThemeProvider`
 * itself reads — see `frontend/src/lib/theme/ThemeProvider.tsx`) through `page.addInitScript`,
 * before the very first navigation in each test — simpler and faster than clicking the theme
 * toggle, and exercises the same code path a real user's persisted preference would.
 * Spec: docs/spec/08 §8.5 (accessibility) · docs/spec/10 §11.6 (Bảng 66) · docs/spec/12 (E2E)
 *
 * Student and admin page scans reuse the worker-scoped sessions from `e2e/helpers/authFixtures.ts`
 * (`anPage` / `adminPage`) instead of a real UI login — this spec is about accessibility, not login
 * itself. Each `page.goto()` below is immediately followed by a `toHaveURL` assertion that we
 * actually landed on the intended path rather than being silently bounced to a login page — found
 * missing while wiring up P18's storageState/session reuse: `ProtectedRoute`'s redirect target is
 * itself perfectly accessible, so a silent auth failure here would otherwise still "pass" an axe
 * scan of the wrong page instead of failing loudly.
 *
 * The student/admin blocks run BOTH modes inside ONE test (looping `MODES`) rather than one test
 * per mode: each test still gets its own fresh worker-scoped `anPage`/`adminPage` fixture instance,
 * so one test per mode would mean two independent real logins per project instead of one, doubling
 * how many of this suite's real `POST /auth/login` calls land in the same short window — needless
 * given light/dark is just a `localStorage` flag toggled between two `page.goto()` calls on the
 * SAME already-authenticated page.
 */
import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './helpers/authFixtures.js';

const SERIOUS_IMPACTS = new Set(['serious', 'critical']);

type Mode = 'light' | 'dark';

/** Forces `ThemeProvider`'s persisted theme choice before any navigation happens in this test. */
async function forceTheme(page: Page, mode: Mode): Promise<void> {
  await page.addInitScript((value) => window.localStorage.setItem('cc.theme', value), mode);
}

/** Navigates to `path` and fails loudly if we were redirected elsewhere (e.g. a stale session). */
async function gotoAndExpectStay(page: Page, path: string): Promise<void> {
  await page.goto(path);
  // `path` is always one of this file's own hardcoded route constants above, never user input.
  // eslint-disable-next-line security/detect-non-literal-regexp
  await expect(page, `expected to stay on ${path}, got redirected instead`).toHaveURL(new RegExp(`${path}$`));
}

/** Runs an axe scan on the current page and asserts 0 serious/critical violations. */
async function expectNoSeriousViolations(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const seriousViolations = results.violations.filter((v) => SERIOUS_IMPACTS.has(v.impact ?? ''));
  if (seriousViolations.length > 0) {
    console.log(`${label} accessibility violations:`, JSON.stringify(seriousViolations, null, 2));
  }
  expect(seriousViolations).toEqual([]);
}

const MODES: Mode[] = ['light', 'dark'];

// ---- Public pages: no auth needed ------------------------------------------------------------
const PUBLIC_PAGES: { path: string; name: string }[] = [
  { path: '/', name: 'landing' },
  { path: '/login', name: 'login' },
];

for (const { path, name } of PUBLIC_PAGES) {
  for (const mode of MODES) {
    test(`${name} page has no serious/critical accessibility violations (${mode})`, async ({ page }) => {
      await forceTheme(page, mode);
      await page.goto(path);
      await expectNoSeriousViolations(page, `${name} (${mode})`);
    });
  }
}

// ---- Student pages: An's account (has real data, so widgets/charts/tables actually render) ----
const STUDENT_PAGES: { path: string; name: string }[] = [
  { path: '/app', name: 'dashboard' },
  { path: '/app/transactions', name: 'transactions' },
  { path: '/app/reports', name: 'reports' },
  { path: '/app/profile', name: 'settings' },
];

test('student pages have no serious/critical accessibility violations (light + dark)', async ({ anPage: page }) => {
  for (const mode of MODES) {
    await forceTheme(page, mode);
    for (const { path, name } of STUDENT_PAGES) {
      await gotoAndExpectStay(page, path);
      await expectNoSeriousViolations(page, `${name} (${mode})`);
    }
  }
});

test('admin users page has no serious/critical accessibility violations (light + dark)', async ({ adminPage: page }) => {
  for (const mode of MODES) {
    await forceTheme(page, mode);
    await gotoAndExpectStay(page, '/admin/users');
    await expectNoSeriousViolations(page, `admin users (${mode})`);
  }
});
