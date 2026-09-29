/**
 * authFixtures.ts
 * Custom Playwright `test`/`expect` that add one already-authenticated `Page` fixture per demo
 * account (`anPage`, `binhPage`, `chiPage`, `adminPage`). Scenario specs that aren't specifically
 * testing the login/onboarding flow itself import `test`/`expect` from here instead of
 * `@playwright/test`, so they start already signed in without performing a real UI login of their
 * own — the fix for `POST /auth/login`'s real 5/min + 20/hour per-(IP,email) rate limit tripping
 * once ~15 scenario specs x up to 4 browser projects would otherwise each drive a real UI login
 * against the same handful of fixed demo emails.
 *
 * Why WORKER-scoped (one real login per account PER PLAYWRIGHT WORKER, reused across every test
 * that worker runs) rather than the more familiar "log in once for the whole run, save
 * `storageState` to a JSON file, every spec loads that file" pattern: this app's refresh tokens are
 * single-use and ROTATE on every redemption, with reuse detection that revokes the WHOLE session
 * family the instant an already-rotated token is presented again
 * (`backend/src/modules/sessions/session.service.ts`'s `rotate`, BR-AU-05..07, spec §5.1.2/§9.5
 * TC-04) — a deliberate anti session-theft control this suite must never weaken. That means a
 * *static* `storageState` snapshot captured once only ever authenticates successfully for the FIRST
 * later browser context that loads it: `AuthProvider`'s on-mount `POST /auth/refresh`
 * (`frontend/src/lib/auth/AuthContext.tsx`) "spends" the one refresh token the file contains, and
 * every other spec loading that same static file afterwards presents an already-rotated token, gets
 * a 401, and is silently treated as logged out — confirmed empirically while wiring this up (every
 * scenario spec beyond the very first consumer of a shared `storageState` file failed; only the
 * `accessibility.spec.ts` axe scans "passed" regardless, because they never asserted they'd actually
 * reached the intended authenticated page, which was its own latent bug, now fixed alongside this).
 *
 * A worker-scoped fixture avoids the collision entirely: within one Playwright worker, tests always
 * run one at a time, so reusing the SAME browser context's cookie jar across many sequential tests
 * is race-free — each test's on-mount refresh call correctly redeems whatever token the PREVIOUS
 * test in that worker already rotated it to (exactly like a real user opening many tabs over time).
 * Total real `POST /auth/login` calls for an account are therefore bounded by the configured worker
 * count (e.g. 4), not by the number of specs that need it, and each worker's first login for a given
 * account happens lazily (only once that worker's first test actually needs it) so they land
 * naturally staggered in time rather than bursting all at once — comfortably under the endpoint's
 * real rate limit in almost every run. When the whole suite runs with real parallelism across BOTH
 * the `chromium` and `mobile-chromium` projects at once (each with its own separate worker pool),
 * it is still possible for more than 5 of An's worker-first logins to land inside the same rolling
 * 60s window (verified empirically: ~9 distinct workers can each need An across a full run) and get
 * a genuine 429 — `loginStudentContext` below retries after waiting out a full window rather than
 * failing the whole fixture (and every test that worker was going to run) on a transient burst.
 *
 * NOT used by `05-edit-transaction-conflict.spec.ts`: that scenario deliberately needs TWO
 * *simultaneously live* sessions for the same student account (two browser tabs open at once) to
 * exercise optimistic locking across them — sharing one worker-scoped context would make both tabs
 * race for the same single-use refresh token and fail exactly like the shared-`storageState` case
 * above. That spec keeps two independent real UI logins, matching how two real devices signed into
 * the same account actually behave (two separate rotation families).
 * Exports: test, expect
 * Spec: docs/spec/12 (testing plan – E2E) · docs/spec/09 §9 (auth), §9.5 (admin MFA)
 */
import { test as base, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { DEMO_ADMIN, STUDENT_AN, STUDENT_BINH, STUDENT_CHI } from './demoAccounts.js';
import { DEMO_ADMIN_TOTP_SECRET } from './totp.js';
import { AdminLoginPage } from '../pages/AdminLoginPage.js';
import { LoginPage } from '../pages/LoginPage.js';

/** Test-level fixtures: an already-authenticated `Page` for each demo account. */
interface AccountPageFixtures {
  anPage: Page;
  binhPage: Page;
  chiPage: Page;
  adminPage: Page;
}

/** Worker-level fixtures: one persistent, real-logged-in `BrowserContext` per account per worker. */
interface AccountContextFixtures {
  anContext: BrowserContext;
  binhContext: BrowserContext;
  chiContext: BrowserContext;
  adminContext: BrowserContext;
}

/** `RATE_LIMIT_PRESETS.authLogin`'s short window (`backend/src/middlewares/rateLimit.ts`) — a failed
 * attempt waits slightly longer than this before retrying, so the retry lands in a fresh window
 * instead of racing the same one. */
const LOGIN_RATE_LIMIT_WINDOW_MS = 65_000;

/** Max real UI login attempts per account per worker before giving up (see module doc comment). */
const MAX_LOGIN_ATTEMPTS = 3;

/**
 * Logs in as a student via the real UI form in a brand-new context, then closes that first tab.
 * Retries on failure (most likely the real per-(IP,email) `POST /auth/login` rate limit, 5/min,
 * being hit by another worker's simultaneous first login for the same account — see module doc
 * comment) by waiting out a full rate-limit window before trying again, rather than failing this
 * worker's fixture (and every test it was going to run) on a transient burst.
 */
async function loginStudentContext(browser: Browser, email: string, password: string): Promise<BrowserContext> {
  for (let attempt = 1; attempt <= MAX_LOGIN_ATTEMPTS; attempt += 1) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await new LoginPage(page).loginAsStudent(email, password);
      await page.close();
      return context;
    } catch (err) {
      await context.close();
      if (attempt === MAX_LOGIN_ATTEMPTS) throw err;
      await new Promise((resolve) => setTimeout(resolve, LOGIN_RATE_LIMIT_WINDOW_MS));
    }
  }
  // Unreachable (the loop above always either returns or throws on its last attempt).
  throw new Error(`loginStudentContext: exhausted ${String(MAX_LOGIN_ATTEMPTS)} attempts for ${email}`);
}

// Worker-fixture setup for the FIRST test that needs it shares that test's own timeout budget by
// default (30s) — comfortably enough for a single login, but not for `loginStudentContext`'s retry
// backoff (up to 2 waits of `LOGIN_RATE_LIMIT_WINDOW_MS` each), hence the generous per-fixture
// `timeout` below (mirrors `adminContext`'s own reason for the same override).
const STUDENT_CONTEXT_FIXTURE_TIMEOUT_MS = 4 * LOGIN_RATE_LIMIT_WINDOW_MS;

export const test = base.extend<AccountPageFixtures, AccountContextFixtures>({
  anContext: [
    async ({ browser }, use) => {
      const context = await loginStudentContext(browser, STUDENT_AN.email, STUDENT_AN.password);
      await use(context);
      await context.close();
    },
    { scope: 'worker', timeout: STUDENT_CONTEXT_FIXTURE_TIMEOUT_MS },
  ],
  binhContext: [
    async ({ browser }, use) => {
      const context = await loginStudentContext(browser, STUDENT_BINH.email, STUDENT_BINH.password);
      await use(context);
      await context.close();
    },
    { scope: 'worker', timeout: STUDENT_CONTEXT_FIXTURE_TIMEOUT_MS },
  ],
  chiContext: [
    async ({ browser }, use) => {
      const context = await loginStudentContext(browser, STUDENT_CHI.email, STUDENT_CHI.password);
      await use(context);
      await context.close();
    },
    { scope: 'worker', timeout: STUDENT_CONTEXT_FIXTURE_TIMEOUT_MS },
  ],
  adminContext: [
    async ({ browser }, use) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      // AdminLoginPage.login retries up to 3 times, ~30s apart, if a shared-secret TOTP time-step
      // collides with another worker's simultaneous first admin login — needs more than the default
      // 30s test timeout budget this worker-fixture setup otherwise shares with whichever test
      // triggers it first, hence the generous per-fixture `timeout` below.
      await new AdminLoginPage(page).login(DEMO_ADMIN.email, DEMO_ADMIN.password, DEMO_ADMIN_TOTP_SECRET);
      await page.close();
      await use(context);
      await context.close();
    },
    { scope: 'worker', timeout: 120_000 },
  ],

  anPage: async ({ anContext }, use) => {
    const page = await anContext.newPage();
    await use(page);
    await page.close();
  },
  binhPage: async ({ binhContext }, use) => {
    const page = await binhContext.newPage();
    await use(page);
    await page.close();
  },
  chiPage: async ({ chiContext }, use) => {
    const page = await chiContext.newPage();
    await use(page);
    await page.close();
  },
  adminPage: async ({ adminContext }, use) => {
    const page = await adminContext.newPage();
    await use(page);
    await page.close();
  },
});

export { expect };
