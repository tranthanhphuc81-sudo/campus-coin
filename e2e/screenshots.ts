/**
 * screenshots.ts
 * Standalone script (NOT a Playwright test file — run directly with `tsx e2e/screenshots.ts` or
 * `npm run screenshots`) that drives a real Chromium browser against the app's own dev server to
 * capture PNG screenshots of the key public/student/admin pages for `README.md` (P21 docs phase).
 *
 * Reuses the same page objects (`LoginPage`, `AdminLoginPage`) and demo accounts
 * (`e2e/helpers/demoAccounts.ts`, `e2e/helpers/totp.ts`) the real E2E suite uses, but drives
 * Playwright directly via `chromium.launch()` / `browser.newContext()` instead of the `test()`
 * fixture framework, since this is a one-shot script, not a test run.
 *
 * Prerequisites (documented, not started by this script):
 *   - `docker compose up -d` (mysql, redis, mailpit)
 *   - `npm run dev` (shared + backend + frontend, watch mode)
 *   - demo data seeded: `npm run db:seed -w backend -- --demo`
 *
 * Main exports: none (script has side effects only — writes PNGs to `docs/screenshots/`).
 * Spec: prompts/21-docs-submission.md item 1 · docs/spec/08 (layouts) · frontend/src/app/router.tsx
 */
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_WEB_PORT, parsePort } from '@campuscoin/shared';
import { chromium, type Page } from '@playwright/test';
import { DEMO_ADMIN, STUDENT_AN } from './helpers/demoAccounts.js';
import { DEMO_ADMIN_TOTP_SECRET } from './helpers/totp.js';
import { AdminLoginPage } from './pages/AdminLoginPage.js';
import { LoginPage } from './pages/LoginPage.js';

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url)).replace(/[\\/]e2e$/, '');

// Mirrors playwright.config.ts's own WEB_URL resolution so this script hits the same dev server.
const envFile = path.join(ROOT_DIR, 'e2e', '.env');
// eslint-disable-next-line security/detect-non-literal-fs-filename
if (existsSync(envFile)) process.loadEnvFile(envFile);
const WEB_URL = `http://localhost:${parsePort(process.env.WEB_PORT, DEFAULT_WEB_PORT, 'WEB_PORT')}`;

const OUT_DIR = path.join(ROOT_DIR, 'docs', 'screenshots');
const VIEWPORT = { width: 1280, height: 800 };

/** Waits for the page's `<h1>` to be visible, then lets network settle so charts/data finish rendering. */
async function waitForPageReady(page: Page): Promise<void> {
  await page.getByRole('heading', { level: 1 }).first().waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  // Small settle delay for chart animations (Chart.js) that finish after the network is idle.
  await page.waitForTimeout(500);
}

/** Navigates to `route` and saves a full-page-viewport PNG to `docs/screenshots/<name>.png`. */
async function capture(page: Page, route: string, name: string): Promise<void> {
  await page.goto(route.startsWith('http') ? route : `${WEB_URL}${route}`);
  await waitForPageReady(page);
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file });
  console.info(`[screenshots] saved ${name}.png`);
}

/** Entry point: launches Chromium, captures all 10 documented pages, then closes the browser. */
async function main(): Promise<void> {
  // `OUT_DIR` is derived from this file's own location, never from user/network input.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const failures: { name: string; error: unknown }[] = [];

  // ---- Public pages (logged out) -----------------------------------------------------------
  // `baseURL` lets the reused page objects' relative `page.goto('/login')` etc. resolve correctly.
  const publicContext = await browser.newContext({ viewport: VIEWPORT, baseURL: WEB_URL });
  const publicPage = await publicContext.newPage();
  for (const [route, name] of [
    ['/', 'landing'],
    ['/login', 'login'],
    ['/register', 'register'],
  ] as const) {
    try {
      await capture(publicPage, route, name);
    } catch (error) {
      failures.push({ name, error });
      console.error(`[screenshots] FAILED ${name}:`, error);
    }
  }
  await publicContext.close();

  // ---- Student pages (logged in as An) -----------------------------------------------------
  const studentContext = await browser.newContext({ viewport: VIEWPORT, baseURL: WEB_URL });
  const studentPage = await studentContext.newPage();
  try {
    await new LoginPage(studentPage).loginAsStudent(STUDENT_AN.email, STUDENT_AN.password);
    for (const [route, name] of [
      ['/app', 'dashboard'],
      ['/app/transactions', 'transactions'],
      ['/app/budgets', 'budgets'],
      ['/app/reports', 'reports'],
      ['/app/insights', 'insights'],
      ['/app/tips', 'tips'],
    ] as const) {
      try {
        await capture(studentPage, route, name);
      } catch (error) {
        failures.push({ name, error });
        console.error(`[screenshots] FAILED ${name}:`, error);
      }
    }
  } catch (error) {
    failures.push({ name: 'student-login', error });
    console.error('[screenshots] FAILED student login:', error);
  }
  await studentContext.close();

  // ---- Admin page (logged in via TOTP) -------------------------------------------------------
  const adminContext = await browser.newContext({ viewport: VIEWPORT, baseURL: WEB_URL });
  const adminPage = await adminContext.newPage();
  try {
    await new AdminLoginPage(adminPage).login(DEMO_ADMIN.email, DEMO_ADMIN.password, DEMO_ADMIN_TOTP_SECRET);
    await capture(adminPage, '/admin/stats', 'admin-dashboard');
  } catch (error) {
    failures.push({ name: 'admin-dashboard', error });
    console.error('[screenshots] FAILED admin-dashboard:', error);
  }
  await adminContext.close();

  await browser.close();

  console.info(`[screenshots] done — ${10 - failures.length}/10 saved to ${OUT_DIR}`);
  if (failures.length > 0) {
    console.error(`[screenshots] failures: ${failures.map((f) => f.name).join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error('[screenshots] fatal error', err);
  process.exit(1);
});
