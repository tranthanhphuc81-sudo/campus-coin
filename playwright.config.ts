/**
 * playwright.config.ts
 * End-to-end test config (P18 test hardening — docs/spec/10 §11.6 Bảng 66, docs/spec/08 §8.5).
 *
 * Project structure (deliberately NOT "every spec × every browser × every viewport" — that matrix
 * would make the suite far slower without proportionally more confidence):
 *   - `chromium`      – the full spec suite, desktop viewport (~1280×720). This is the primary,
 *                       most-exercised project; every new scenario spec runs here by default.
 *   - `firefox`       – a curated "critical path" subset only (smoke, auth, quick-add, transaction
 *                       CRUD, CSV import, PDF export, admin login) — enough to catch a real
 *                       cross-engine regression (form autofill quirks, file-chooser/download
 *                       handling) without doubling total run time for scenarios that are pure
 *                       Bootstrap/React DOM with no browser-specific behaviour.
 *   - `webkit`        – the same critical-path subset as `firefox`, for the same reason (WebKit's
 *                       download/file-input handling differs the most from Chromium/Firefox).
 *   - `mobile-chromium` – viewport 375×812 (docs/spec/10 Bảng 66's narrower phone width), running
 *                       only the specs that specifically assert responsive/accessibility behaviour
 *                       at small widths: `accessibility.spec.ts` (WCAG 2.2 AA, light+dark) and
 *                       `settings-dark-mode-font-scale.spec.ts` (TC-27: dark mode + 130% font at
 *                       375px must not overflow and must stay AA). Chromium (not Firefox/WebKit) is
 *                       used for the mobile viewport since Playwright's viewport emulation is
 *                       browser-agnostic and running it 3× would add no extra signal here.
 * `accessibility.spec.ts` itself also runs under the plain `chromium` project (1280×800) so both
 * viewports named in the phase prompt (375 and 1280) get an axe pass, not just 375.
 *
 * A `globalSetup` (`e2e/global-setup.ts`) re-seeds the demo accounts/datasets before every run so
 * every spec starts from the same known DB state. The frontend dev server is started automatically
 * via `webServer` below; the backend API + worker + Mailpit are NOT started here (deliberately) —
 * spinning up a whole Docker Compose stack + 2 extra Node processes from `webServer` would make
 * `npm run test:e2e` slower and more fragile to run repeatedly while iterating on a single spec, and
 * every spec's header comment already documents the 3 commands to run first
 * (`docker compose up -d`, `npm run dev`, `npm run worker -w backend`) exactly like before P18.
 *
 * Login-rate-limit reliability (P18): scenario specs that don't specifically test the login flow
 * itself (i.e. everything except 01, 02, 03 and 15's login step) get an already-authenticated
 * `Page` from `e2e/helpers/authFixtures.ts`'s custom `test` instead of driving a real UI login.
 * That file's header explains why this is a WORKER-scoped fixture (one real login per account per
 * Playwright worker, reused across every test that worker runs) rather than the more common
 * "log in once for the whole run, save `storageState`, every spec loads that file" pattern: this
 * app's refresh tokens are single-use and rotate on every redemption with full-family revocation on
 * reuse (a deliberate anti session-theft control, `backend/src/modules/sessions/session.service.ts`
 * — must never be weakened), so a *static* `storageState` snapshot only ever authenticates
 * successfully for the very first browser context that ever loads it — verified empirically. The
 * worker-scoped fixture still keeps real `POST /auth/login` calls per account bounded by the
 * configured worker count (not the number of specs), comfortably under that endpoint's real
 * 5/min + 20/hour per-(IP,email) rate limit.
 *
 * Spec: docs/spec/12 (testing plan – E2E) · docs/spec/10 §11.3, §11.6 (Bảng 66) · docs/spec/08 §8.5
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_WEB_PORT, parsePort } from '@campuscoin/shared';
import { defineConfig, devices } from '@playwright/test';

const envFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '.env');
// Variables already set in the shell win over .env (loadEnvFile never overrides them).
if (existsSync(envFile)) process.loadEnvFile(envFile);

const WEB_URL = `http://localhost:${parsePort(process.env.WEB_PORT, DEFAULT_WEB_PORT, 'WEB_PORT')}`;

/**
 * "Critical path" specs run on Firefox and WebKit in addition to Chromium — chosen for either
 * genuine cross-engine risk (file upload/download, EventSource/SSE) or being the highest-value
 * happy paths (auth, quick-add). Every other scenario spec runs on Chromium only.
 */
const CROSS_BROWSER_SPECS = [
  '**/smoke.spec.ts',
  '**/01-register-verify-login-onboarding.spec.ts',
  '**/02-login-logout.spec.ts',
  '**/04-quick-add-ai-category.spec.ts',
  '**/06-delete-undo-trash.spec.ts',
  '**/09-csv-import.spec.ts',
  '**/10-reports-pdf.spec.ts',
  '**/15-admin-flow.spec.ts',
];

/** Specs that specifically assert responsive/accessibility behaviour at a 375px phone width. */
const MOBILE_VIEWPORT_SPECS = ['**/accessibility.spec.ts', '**/14-settings-dark-mode-font-scale.spec.ts'];

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // BUGFIX: this project previously had no `testIgnore`, so its default "run every spec"
      // matching silently ALSO picked up the mobile-only 375px spec above — contradicting this
      // file's own header comment and wastefully doubling its real login (found while reducing
      // real `POST /auth/login` calls for P18's rate-limit reliability work).
      testIgnore: '**/14-settings-dark-mode-font-scale.spec.ts',
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testMatch: CROSS_BROWSER_SPECS },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testMatch: CROSS_BROWSER_SPECS },
    {
      name: 'mobile-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } },
      testMatch: MOBILE_VIEWPORT_SPECS,
    },
  ],
  webServer: {
    command: 'npm run dev -w @campuscoin/frontend',
    url: WEB_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
