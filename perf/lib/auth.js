/**
 * lib/auth.js
 * Shared k6 helper: logs in as one of the seeded demo students (docs/spec/10 §11.5, created by
 * `npm run db:seed -w backend` / `--demo`) and returns an access token + a usable category id.
 * Every perf/*.js script's `setup()` calls this ONCE per test run (k6 runs `setup()` on a single
 * VU before the load phase starts) so login itself is never part of the measured load.
 */
import http from 'k6/http';
import { check, fail } from 'k6';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
// Uses "an.nguyen" (Bảng 65 — 6 months of seeded data) so list/dashboard queries have realistic
// volume to page/aggregate over, not an empty account.
const EMAIL = __ENV.PERF_EMAIL || 'an.nguyen@campuscoin.demo';
const PASSWORD = __ENV.PERF_PASSWORD || 'Student@Campus2026!';

/** Logs in and fetches one usable expense category id. Call from `setup()`, not per-iteration. */
export function login() {
  const loginRes = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(loginRes, { 'login: 200': (r) => r.status === 200 });
  if (loginRes.status !== 200) {
    fail(`login failed (${loginRes.status}): ${loginRes.body} — is the demo seed loaded? (npm run db:seed -- --demo)`);
  }
  const accessToken = loginRes.json('accessToken');

  const categoriesRes = http.get(`${BASE_URL}/api/v1/categories`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  check(categoriesRes, { 'categories: 200': (r) => r.status === 200 });
  const expenseCategory = categoriesRes.json().find((c) => c.type === 'expense');
  if (!expenseCategory) {
    fail('no expense category found for the demo student — is the demo seed loaded?');
  }

  return { accessToken, categoryId: expenseCategory.id };
}

/** Standard auth header object for a request made with `data.accessToken` from {@link login}. */
export function authHeaders(accessToken) {
  return { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } };
}
