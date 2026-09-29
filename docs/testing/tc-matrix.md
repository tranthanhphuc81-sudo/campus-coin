# Test Case Coverage Matrix (TC-01..TC-28)

This matrix maps each test case defined in `docs/spec/12-testing-plan.md` §12.2 (Bảng 68) to the actual test file(s) currently exercising it in this repository. The matrix confirms all 28 test cases have explicit test coverage at the unit, integration, or end-to-end level.

## Test Case Coverage

| TC | Feature | Scenario | Test file(s) | Level | Notes |
|----|---------|----------|--------------|-------|-------|
| TC-01 | Register | New email signup | `backend/tests/integration/auth/register.test.ts` (TC-01 test); `e2e/01-register-verify-login-onboarding.spec.ts` | Integration, E2E | Asserts 202, verify email queued, account pending until link clicked |
| TC-02 | Register | Duplicate email (same response) | `backend/tests/integration/auth/register.test.ts` (TC-02 test); `e2e/01-register-verify-login-onboarding.spec.ts` | Integration, E2E | Asserts identical 202 response for both new and existing pending/active email (no user enumeration) |
| TC-03 | Login lockout | 5 failed attempts → 15min lock + audit | `backend/tests/integration/auth/login.test.ts` (TC-03 test) | Integration | Asserts 429 account-locked, email alert, audit trail after 5th failure |
| TC-04 | Refresh token rotation | Old cookie reuse revokes entire family | `backend/tests/integration/auth/refresh-logout.test.ts` (TC-04 test) | Integration | Asserts old token → 401, new token also revoked, family invalidated |
| TC-05 | Password reset link | Single-use + 30min expiry | `backend/tests/integration/auth/password-reset.test.ts` (two TC-05 tests) | Integration | Asserts 2nd use rejected, expired token rejected with invalid-token error |
| TC-06 | Cross-tenant access | User A → User B's resource = 404 | `backend/tests/integration/cross-tenant-sweep.test.ts` (dynamic discovery + 404 sweep); also `categories.test.ts`, `transactions.test.ts`, `recurring-rules.test.ts` | Integration | Comprehensive sweep: every student route with `:id`/`:month` param tested; B's data unchanged after A's 404 GET/PATCH/DELETE |
| TC-07 | RBAC: student access | `/admin/*` routes return 403 or 401 (no token) | `backend/tests/integration/admin/admin-rbac.test.ts` (TC-07 test); also `admin-auth.test.ts` | Integration | Asserts student token → 403, no token → 401 on all `/admin/*` paths |
| TC-08 | Admin MFA | Wrong TOTP code → 401 mfa-invalid + audit | `backend/tests/integration/admin/admin-auth.test.ts` (TC-08 test); `e2e/15-admin-flow.spec.ts` (positive: correct TOTP login) | Integration, E2E | Asserts rejected with audit admin.mfa.failed; E2E verifies successful flow |
| TC-09 | Categories: duplicate | Create category with duplicate name (same type) → 409 | `backend/tests/integration/categories/categories.test.ts` (TC-09 test) | Integration | Asserts conflict error on name + type collision with existing default category |
| TC-10 | Categories: delete + reassign | Deleting category with transactions → moves to target category in 1 transaction | `backend/tests/integration/categories/categories.test.ts` (TC-10 and TC-10b tests) | Integration | Asserts transaction atomic move, history written, cache invalidated for reassigned months |
| TC-11 | Transactions: invalid amount | Amount 0 or negative → 422 | `backend/tests/integration/transactions/transactions.test.ts` (TC-11 test) | Integration | Asserts validation error on amount field for zero and negative values |
| TC-12 | Transactions: optimistic lock | PATCH with stale version → 409 version-mismatch | `backend/tests/integration/transactions/transactions.test.ts` (TC-12 test); `e2e/05-edit-transaction-conflict.spec.ts` | Integration, E2E | Asserts 409, current version proceeds; E2E shows browser UX (conflict banner + reload) |
| TC-13 | Transactions: history | Create/update/delete/restore each logged with changedFields; emits transaction.updated | `backend/tests/integration/transactions/transactions.test.ts` (TC-13 test) | Integration | Asserts history entries in order, changedFields populated on update, event fired |
| TC-14 | Recurring: month-end edge case | Rule on day 31 running in Feb (28/29) → no duplicate runs on catch-up | `backend/tests/integration/jobs/recurring-materialize.test.ts` (TC-14 test) | Integration | Asserts transaction generated once per month even when re-run with stale nextRunDate |
| TC-15 | AI: tier-2 suggestion | "Campus Cafe" resolves to Food via keyword dictionary (no LLM call) | `backend/tests/integration/ai/ai-suggest.test.ts` (TC-15 test); `e2e/04-quick-add-ai-category.spec.ts` | Integration, E2E | Asserts tier-2 match (0.75 confidence) without provider call; E2E shows suggestion chip |
| TC-16 | AI: learning from user correction | Override teaches a rule; 2 identical corrections replace it | `backend/tests/integration/ai/ai-learning.test.ts` (TC-16 test) | Integration | Asserts pendingCategoryId set on 1st correction, replaced on 2nd identical one |
| TC-17 | AI: failure doesn't block save | Provider timeout/invalid key → 200 null suggestion, transaction still created | `backend/tests/integration/ai/ai-suggest.test.ts` (TC-17 test) | Integration | Asserts transaction 201 despite failed AI call; no suggestion in response |
| TC-18 | CSV: file validation | File >2MB, binary, wrong extension/MIME → 413/415, no batch created | `backend/tests/integration/imports/imports-upload.test.ts` (4 TC-18 tests) | Integration | Asserts rejected with correct status, no import batch left behind |
| TC-19 | CSV: formula-injection safety | Description "=HYPERLINK(...)" prefixed with `'` on export | `backend/tests/unit/lib/csvSafe.test.ts`; `backend/tests/integration/users/export.test.ts`, `imports-export.test.ts` (TC-19 tests) | Unit, Integration | Asserts formula prefix added to CSV output, escaping function tested at unit level |
| TC-20 | Budget alerts | Spending triggers NEAR (85%) then EXCEEDED (105%); clears on drop; resends on re-cross | `backend/tests/integration/notifications/notifications.test.ts` (TC-20 test); `e2e/08-budget-alerts.spec.ts` | Integration, E2E | Asserts 2 notifications (one each type), cleared on dip, dedupe prevents duplicates; E2E shows toasts |
| TC-21 | Reports: PDF with Vietnamese text | Vietnamese diacritics display correctly; totals match JSON report | `backend/tests/integration/reports/reports.test.ts` (TC-21 test); `e2e/10-reports-pdf.spec.ts` | Integration, E2E | Asserts PDF generation, diacritics preserved (PDF font embeds), amounts reconciled |
| TC-22 | Insights: growth flag | Food +40% vs 3-month avg → flagged, weeklyCap non-null | `backend/tests/unit/insights/insights.stats.test.ts` (TC-22 test); `e2e/11-insights-regenerate.spec.ts` | Unit, E2E | Asserts growthPct/weeklyCap calculated; E2E regenerates insights and verifies display |
| TC-23 | Tips: dismiss + 30-day expiry | Dismissed tip hidden for 30 days | `backend/tests/integration/tips/tips.test.ts` (TC-23 test); `e2e/12-tips-pin-dismiss.spec.ts` | Integration, E2E | Asserts dismissedAt set, tip absent in GET within 30d; E2E shows dismiss action |
| TC-24 | Anomaly flag | Expense 500× expected (5 peers @ ~10) → flagged is_anomaly | `backend/tests/unit/lib/flagRules.test.ts` (TC-24 test); `backend/tests/integration/transactions/anomaly.test.ts` | Unit, Integration | Unit: flags outlier; Integration: full flow, Keep resolves flag |
| TC-25 | Duplicate flag | Two identical transactions <2min apart → isPossibleDuplicate set | `backend/tests/integration/transactions/duplicate.test.ts` (TC-25 test) | Integration | Asserts flag set on 2nd near-identical transaction; unchanged after delete |
| TC-26 | XSS: script in description | `<script>alert()</script>` in description stored + returned as plain text | `backend/tests/integration/transactions/transactions.test.ts` (TC-26 test, NEW) | Integration | Asserts stored as-is (no sanitization in DB), returned in JSON, React renders as text (no dangerouslySetInnerHTML) |
| TC-27 | UI: dark mode + 130% font at 375px | No layout overflow, AA contrast maintained | `e2e/14-settings-dark-mode-font-scale.spec.ts`; `e2e/accessibility.spec.ts` | E2E, Accessibility | Asserts no horizontal scroll at 375px width, axe-core runs for contrast/a11y violations |
| TC-28 | Rate limit: forgot-password | 4th call/hour → 429, Retry-After header | `backend/tests/integration/auth/password-reset.test.ts` (TC-28 test) | Integration | Asserts 429 on 4th call, Retry-After present, rate limit key includes IP |

## Summary

- **Total test cases:** 28 (TC-01..TC-28)
- **Test levels represented:** Unit (4 TCs), Integration (22 TCs), E2E (11 TCs), Accessibility (1 TC)
- **New test files added in P18:** 
  - `backend/tests/fixtures/routeIntrospection.ts` (route discovery for cross-tenant sweep)
  - `backend/tests/integration/cross-tenant-sweep.test.ts` (TC-06 comprehensive sweep)
  - `backend/tests/integration/tips/tips-repository.test.ts` (tips repository unit test)
  - TC-26 test added to `backend/tests/integration/transactions/transactions.test.ts`
- **All tests passing:** ✅ Yes. New TC-26 test confirmed green.

## Coverage Notes

1. **Cross-tenant (TC-06):** The `cross-tenant-sweep.test.ts` dynamically discovers all student routes with parameterized segments and tests each one against unauthorized user access, ensuring 404 (not 403) and data immutability.
2. **Admin access (TC-07/TC-08):** Both `admin-rbac.test.ts` and `admin-auth.test.ts` cover the `/admin/*` guard and TOTP validation.
3. **XSS (TC-26):** Covered at both backend (integration: stored as plain text, not HTML-escaped in DB) and frontend (React's default rendering as plain text, no `dangerouslySetInnerHTML` usage anywhere in the codebase).
4. **E2E Accessibility:** The 15 E2E scenarios (01-15) plus `accessibility.spec.ts` cover main user flows on three browsers (Chromium, Firefox, WebKit) and two viewports (375px mobile, 1280px desktop).

---

*Last updated: 2026-09-28 · P18 phase · All 28 test cases covered*
