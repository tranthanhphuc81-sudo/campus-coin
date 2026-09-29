/**
 * security.spec.ts
 * P19 security-review manual/E2E checks against the real running stack (frontend + backend +
 * MySQL + Redis + Mailpit), complementing the backend Vitest/Supertest suite's own coverage of
 * the same test cases (`docs/testing/tc-matrix.md`). Requires the same 3 processes every other
 * E2E spec needs: `docker compose up -d`, `npm run dev`, `npm run worker -w backend`.
 * Covers: JWT `alg:none`/forged-signature rejection, refresh-token reuse revoking the whole
 * session family (TC-04), rate limiting (TC-28), a Windows executable disguised as a `.csv`
 * import being rejected (TC-18), and a `<script>` transaction description rendering as literal
 * text in a real browser, never executing (TC-26).
 * Spec: docs/spec/09 (security) · docs/testing/tc-matrix.md · docs/security/review-p19.md
 */
import { expect, request as playwrightRequest, test, type APIResponse } from '@playwright/test';
import { REFRESH_COOKIE_NAME } from '@campuscoin/shared';
import { registerStudentViaApi } from './helpers/apiRegister.js';
import { extractLink, waitForEmailBody } from './helpers/mailpit.js';
import { ImportWizardPage } from './pages/ImportWizardPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { TransactionsPage } from './pages/TransactionsPage.js';

/**
 * Extracts one `name=value` cookie's value from a response's `Set-Cookie` header(s), if present.
 * `name` is always this file's own literal `REFRESH_COOKIE_NAME` constant, never attacker input.
 */
async function setCookieValue(response: APIResponse, name: string): Promise<string | undefined> {
  const headers = await response.headersArray();
  const setCookieHeaders = headers.filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value);
  for (const header of setCookieHeaders) {
    // eslint-disable-next-line security/detect-non-literal-regexp -- see doc comment above.
    const match = new RegExp(`^${name}=([^;]+)`).exec(header);
    if (match) return match[1];
  }
  return undefined;
}

/** Base64url-encodes a plain object as one JWT segment (no padding, `+`/`/` replaced). */
function b64urlJson(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

test.describe('JWT verification rejects forged tokens', () => {
  test('alg:none token (no signature) is rejected', async ({ request, baseURL }) => {
    const header = b64urlJson({ alg: 'none', typ: 'JWT' });
    const payload = b64urlJson({ sub: 'attacker', role: 'student', sid: 'fake-session', exp: 9_999_999_999 });
    const forgedToken = `${header}.${payload}.`;

    const response = await request.get(`${baseURL}/api/v1/me`, {
      headers: { Authorization: `Bearer ${forgedToken}` },
    });

    expect(response.status()).toBe(401);
    const body = (await response.json()) as { type?: string };
    expect(body.type).toBe('unauthenticated');
  });

  test('a well-formed-looking token with a bogus signature is rejected', async ({ request, baseURL }) => {
    const header = b64urlJson({ alg: 'EdDSA', typ: 'JWT', kid: 'attacker-supplied-kid' });
    const payload = b64urlJson({ sub: 'attacker', role: 'admin', sid: 'fake-session', exp: 9_999_999_999 });
    const bogusSignature = Buffer.from('not-a-real-signature').toString('base64url');
    const forgedToken = `${header}.${payload}.${bogusSignature}`;

    const response = await request.get(`${baseURL}/api/v1/me`, {
      headers: { Authorization: `Bearer ${forgedToken}` },
    });

    expect(response.status()).toBe(401);
  });
});

test('rate limiting: the 4th forgot-password call within an hour for the same email is 429 with Retry-After (TC-28)', async ({
  request,
  baseURL,
}) => {
  // A never-registered, unique-per-run email: this endpoint never reveals whether an email is
  // registered (BR-AU-03), so an unknown address exercises the exact same rate-limit code path.
  const email = `e2e-ratelimit-${Date.now()}@example.com`;

  let last;
  for (let call = 1; call <= 4; call += 1) {
    last = await request.post(`${baseURL}/api/v1/auth/forgot-password`, { data: { email } });
    if (call < 4) expect(last.status()).toBe(202);
  }

  expect(last!.status()).toBe(429);
  expect(last!.headers()['retry-after']).toBeTruthy();
});

/**
 * Calls `POST /auth/refresh` presenting exactly `refreshToken` and nothing else — a brand-new,
 * disposable {@link APIRequestContext} per call so Playwright's own cookie jar (which would
 * otherwise auto-track and re-send whatever the LATEST response rotated the cookie to) can never
 * shadow or merge with the specific, manually-chosen token this test means to present.
 */
async function refreshWithToken(baseURL: string, refreshToken: string) {
  const ctx = await playwrightRequest.newContext();
  try {
    return await ctx.post(`${baseURL}/api/v1/auth/refresh`, {
      headers: {
        Origin: baseURL,
        'X-Requested-With': 'XMLHttpRequest',
        Cookie: `${REFRESH_COOKIE_NAME}=${refreshToken}`,
      },
    });
  } finally {
    await ctx.dispose();
  }
}

test('refresh-token reuse revokes the whole session family (TC-04, full stack)', async ({ request, baseURL }) => {
  const student = await registerStudentViaApi(request, baseURL!);
  const emailBody = await waitForEmailBody(request, student.email);
  const verifyUrl = new URL(extractLink(emailBody, '/verify-email'));
  const verifyToken = verifyUrl.searchParams.get('token');
  const verifyResponse = await request.post(`${baseURL}/api/v1/auth/verify-email`, { data: { token: verifyToken } });
  expect(verifyResponse.status()).toBe(200);

  // Login through its own fresh context too, for the same reason `refreshWithToken` uses one.
  const loginCtx = await playwrightRequest.newContext();
  const loginResponse = await loginCtx.post(`${baseURL}/api/v1/auth/login`, {
    data: { email: student.email, password: student.password },
  });
  expect(loginResponse.status()).toBe(200);
  const originalRefreshToken = await setCookieValue(loginResponse, REFRESH_COOKIE_NAME);
  expect(originalRefreshToken).toBeTruthy();
  await loginCtx.dispose();

  // Rotate once: the original token is now stale, a fresh one takes its place.
  const rotateResponse = await refreshWithToken(baseURL!, originalRefreshToken!);
  expect(rotateResponse.status()).toBe(200);
  const rotatedRefreshToken = await setCookieValue(rotateResponse, REFRESH_COOKIE_NAME);
  expect(rotatedRefreshToken).toBeTruthy();
  expect(rotatedRefreshToken).not.toBe(originalRefreshToken);

  // Replaying the now-stale ORIGINAL token must be rejected, not silently accepted.
  const reuseResponse = await refreshWithToken(baseURL!, originalRefreshToken!);
  expect(reuseResponse.status()).toBe(401);

  // BR-AU-05..07: reuse revokes the WHOLE family, so even the token the rotation just handed
  // back (never itself reused) must now also be rejected.
  const rotatedNowRevokedResponse = await refreshWithToken(baseURL!, rotatedRefreshToken!);
  expect(rotatedNowRevokedResponse.status()).toBe(401);
});

test.describe('logged-in browser checks', () => {
  test.describe.configure({ mode: 'serial' });

  let email: string;
  let password: string;

  test.beforeAll(async ({ request, baseURL }) => {
    const student = await registerStudentViaApi(request, baseURL!);
    const emailBody = await waitForEmailBody(request, student.email);
    const verifyUrl = new URL(extractLink(emailBody, '/verify-email'));
    const verifyToken = verifyUrl.searchParams.get('token');
    const verifyResponse = await request.post(`${baseURL}/api/v1/auth/verify-email`, { data: { token: verifyToken } });
    expect(verifyResponse.status()).toBe(200);
    email = student.email;
    password = student.password;
  });

  test('CSV import rejects a Windows executable disguised as a .csv upload (TC-18)', async ({ page }) => {
    await new LoginPage(page).login(email, password);

    const importWizard = new ImportWizardPage(page);
    await importWizard.goto();

    // MZ + DOS-header bytes: the same signature the backend's TC-18 content-sniffing check
    // (`imports.upload.ts`) rejects regardless of the claimed extension/MIME type.
    const exeBytes = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);

    await page.getByLabel('Choose file').setInputFiles({
      name: 'evil.csv',
      mimeType: 'text/csv',
      buffer: exeBytes,
    });

    await expect(page.getByRole('alert')).toBeVisible({ timeout: 10_000 });
    // Never reaches the Map & Preview step's "ready to import" summary.
    await expect(page.getByText(/ready to import/i)).not.toBeVisible();
  });

  test('a <script> transaction description renders as literal text, never executes (TC-26)', async ({ page }) => {
    let dialogFired = false;
    page.on('dialog', (dialog) => {
      dialogFired = true;
      void dialog.dismiss();
    });

    await new LoginPage(page).login(email, password);

    const payload = '<script>window.__e2eXssFired = true</script>';
    const transactions = new TransactionsPage(page);
    await transactions.goto();
    await transactions.quickAdd({ amount: '5.00', description: payload, categoryLabel: 'Miscellaneous' });

    // Rendered as visible literal text (React's default escaping), not as an executing element.
    await expect(page.getByText(payload)).toBeVisible();
    const xssFired = await page.evaluate(() => (window as unknown as { __e2eXssFired?: boolean }).__e2eXssFired);
    expect(xssFired).toBeUndefined();
    expect(dialogFired).toBe(false);
  });
});
