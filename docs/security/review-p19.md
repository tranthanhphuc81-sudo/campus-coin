# P19 – Security review findings

Consolidated from 3 focused `security-reviewer` passes (read-only, OWASP/ASVS-style) plus automated
checks. Scope (per `prompts/19-security-review.md`):
- **(a)** auth/sessions/admin: `modules/auth`, `modules/users`, `modules/admin*`, `middlewares/`
- **(b)** user data: `modules/transactions|categories|budgets|imports|reports|bookmarks|recurring`, repositories
- **(c)** AI/email/config/frontend: `integrations/`, `config/`, helmet/CSP, cookies, `frontend/src/lib`, AI/user-text rendering

Severity: Critical / High / Medium / Low. Status: Open / Fixed / Deferred (with reason) / Accepted risk.

## Summary

| Severity | Count | Fixed | Fixed (partial, rest is P20 infra) | Deferred |
|---|---|---|---|---|
| Critical | 0 | – | – | – |
| High | 1 | 1 | 0 | 0 |
| Medium | 13 | 11 | 2 (C-M1, C-M2) | 0 |
| Low | 26 | 21 | 0 | 5 |

A confirmation re-review of scope (a) (below) — required by the phase before it can close — found
the first round of fixes introduced one new Medium (an availability regression, not a security
weakening: A-M5) and one residual Low (A-L11); both are recorded and fixed/tracked above and
counted in these totals.

## Dependency vulnerabilities (npm audit)

| ID | Severity | Package | Description | Status |
|---|---|---|---|---|
| DEP-1 | High | `mariadb` 3.4.5 (transitive via `@prisma/adapter-mariadb`) | Cleartext password leak to MitM despite `ssl:true`; possible SQL injection in Buffer escaping under certain charsets (GHSA-cqhc-2h57-wpxf, GHSA-42r5-vhpq-m858, GHSA-g5xc-5w98-jfvm) | **Fixed** — pinned to 3.5.4 via root `package.json` `overrides` (this is the actual runtime DB driver) |
| DEP-2 | High | `mysql2` 3.15.3 (transitive via `prisma` CLI) | Auth plugin downgrade leaking plaintext credentials; decompression-bomb DoS | **Fixed** — pinned to 3.24.4 via `overrides` (CLI-only dep, not used by the running app, but fixed anyway since a clean fix was available without a Prisma major bump) |
| DEP-3 | Moderate | `deepmerge-ts` <8.0.0 (transitive via `@prisma/config`) | Stack exhaustion on recursive object graphs | **Fixed** — pinned to 8.0.2 via `overrides` |

`npm audit` and `npm audit --omit=dev`: **0 vulnerabilities** after the fix (was 6: 5 High, 1 Moderate).
Verified `npm run typecheck` and the backend test suite (real MySQL via the new mariadb 3.5.4 driver)
still pass after the bump — see PROGRESS.md.

## (a) Auth, sessions, admin

| ID | Sev | Location | Finding | Fix | Status |
|---|---|---|---|---|---|
| A-M1 | Medium | `middlewares/rateLimit.ts` (default key, `ipAndEmailKey`, `ipAndMfaTokenKey`, `userIdKey` fallback) | IPv6 keys use the raw `/128` address (`ERR_ERL_KEY_GEN_IPV6`); an attacker with a `/64` gets a fresh rate-limit bucket per request, enabling unlimited reset/verification emails and register-triggered Argon2id DoS | Use `ipKeyGenerator` (subnet /56) in every IP-based key; add a per-email-only limiter on forgot-password/resend-verification | Fixed |
| A-M2 | Medium | `middlewares/rateLimit.ts`, `auth.routes.ts` | Login limiters keyed by IP+email only → one IP can spray 1-4 passwords across unlimited accounts without ever tripping per-account lockout | Added IP-only limiter on `authLogin`/`adminAuthLogin` (100/min, 1000/h — raised from an initial 30/min+200/h after the confirmation review below found the lower caps blocked legitimate shared-NAT traffic) | Fixed |
| A-M3 | Medium | `auth.service.ts` login (~L379-392) | Unknown emails never lock (always 401); real accounts return 429 after 5 fails → account enumeration in 6 requests; locked-account attempts on a *known* account weren't audited | Added Redis shadow-lockout counter keyed by `sha256(email)` for unknown emails (same 429 response), `dummyVerify()` on the locked branch, and an `auth.login.failed` audit record with `reason:'locked'` | Fixed |
| A-M4 | Medium | `admin-auth.service.ts`, `scripts/create-admin.ts` | Admin MFA enrolment protected only by the password known from `.env`; whoever completes TOTP enrolment first (first `/admin/auth/login`) owns the 2nd factor | `create-admin.ts` now generates and encrypts the MFA secret + prints QR/recovery codes at CLI creation time; login no longer offers open enrolment for an unenrolled admin | Fixed |
| A-L1 | Low | `middlewares/errorHandler.ts`, `lib/problem.ts` | Prisma fallback error puts the raw Prisma error code in the client-facing `detail` (leaks ORM/internal detail) — pre-flagged in PROGRESS.md P07/P03 | `detail` omitted for 5xx; Prisma code now logged server-side only (`errorHandler.test.ts` asserts no `P2xxx`/`Prisma` string in the body) | Fixed |
| A-L2 | Low | `middlewares/requestId.ts` | Client-supplied `X-Request-Id` accepted unchecked (any length/charset), echoed into logs/responses | Validated against `/^[A-Za-z0-9-]{8,64}$/`, else generate `randomUUID()` | Fixed |
| A-L3 | Low | `prisma/schema.prisma`, `modules/audit/audit.service.ts` | Audit log has no `requestId` column (spec 9.4 wants one) | **Deferred** — needs a migration; tracked for P20 | Deferred |
| A-L4 | Low | `auth.service.ts` forgotPassword/register | Response-time side channel reveals account existence (extra DB writes for existing accounts) | **Deferred** — needs moving the write path into the worker queue, bigger change; tracked for P20 | Deferred |
| A-L5 | Low | `middlewares/rateLimit.ts` | `passOnStoreError: true` on every preset — a Redis outage disables all auth rate limiting | Set `passOnStoreError: false` for the auth-related presets (login, register, forgot-password, admin auth, MFA); left fail-open on `authenticatedDefault` | Fixed |
| A-L6 | Low | `auth.routes.ts` | `/verify-email`, `/reset-password`, `/refresh`, `/logout` have no rate limit | Added `authTokenAction` (60/min, IP-keyed) to `/verify-email`/`/reset-password`, and `authRefreshLogout` (60/min keyed by a hash of the refresh cookie itself, + a 300/min IP backstop for cookie-less requests) to `/refresh`/`/logout` — split into two presets, and `/refresh`/`/logout` moved off an IP key entirely, after the confirmation review below found a single shared IP-only `authGeneral` bucket broke shared-NAT users | Fixed |
| A-L7 | Low | `admin-auth.service.ts` | Admin TOTP lockout escalation caps at 60 min with no permanent lock | **Deferred** — needs an owner decision on out-of-band unlock policy | Deferred |
| A-L8 | Low | `admin-users.service.ts` disable | Sessions revoked before status flips to `DISABLED`; a login racing in between isn't revoked | Added a second `revokeAllSessions()` call after the status update (idempotent) | Fixed |
| A-L9 | Low | `middlewares/security.ts` | Helmet's CSP defaults merged in, widening `font-src` beyond spec Table 57 | `useDefaults: false`, explicit directive list incl. `object-src 'none'` | Fixed |
| A-L10 | Low | `config/env.ts`, `lib/crypto.ts` | `CORS_ORIGINS` entries and `DATA_ENCRYPTION_KEY` not validated at boot (bad key only fails at first use, `null` origin not rejected) | `CORS_ORIGINS` validated as URLs (rejects `null`/`*`); `DATA_ENCRYPTION_KEY` checked to decode to exactly 32 bytes at boot | Fixed |
| A-M5 | **Medium (new — found in confirmation re-review)** | `middlewares/rateLimit.ts`, `auth.routes.ts` | The initial A-M2/A-L6 fixes keyed the login-spray backstop and the new `/refresh`+`/logout` limiter by IP alone (30/min, 200/h and 30/min respectively). CampusCoin's real userbase is college students, many behind one shared campus NAT/eduroam egress IPv4 address; `AuthContext` calls `/auth/refresh` on every page load and access-token expiry (every ~15 min) for every active session, so that shared bucket fills from ordinary legitimate traffic alone once enough students are behind the same IP at once — at which point everyone else behind it gets 429'd on their next refresh, which the frontend treats as a hard logout. This is an availability regression the fix itself introduced, not a pre-existing issue. | `/refresh`/`/logout` now key by `sha256(refresh cookie)` (`refreshCookieKey`, new `authRefreshLogout` preset) so every real session gets its own bucket; only a cookie-less/malformed request falls back to a (much higher, 300/min) IP-collapsed bucket. `/verify-email`/`/reset-password` (low-frequency, one-shot actions) stay IP-keyed but moved to their own `authTokenAction` preset at 60/min. The login/admin-login IP-only backstops (A-M2) were raised from 30/min+200/h to 100/min+1000/h — still tight enough to catch a real multi-account spray, loose enough not to trip on shared-NAT load. New regression test in `rateLimit.test.ts` proves a burst of cookie-less requests from one IP never blocks a different, real session sharing that IP. | Fixed |
| A-L11 | **Low (new — found in confirmation re-review)** | `auth.service.ts`, `auth.repository.ts` | The A-M3 shadow-lockout counter (for unknown emails) expires after 24h (`SHADOW_LOCKOUT_COUNTER_TTL_SEC`), but a real account's `failedLoginCount` never decays on its own (only a successful login or password reset clears it) — so an attacker who waits over 24h between probes can still eventually distinguish a registered email from an unregistered one by whether a 5th/6th attempt 429s. Much slower than before A-M3 (still capped by the outer per-IP hourly limiters) but not fully closed. | **Deferred** — needs `failedLoginCount` to decay on the same schedule as the shadow counter (e.g. reset it when the last failure is older than `SHADOW_LOCKOUT_COUNTER_TTL_SEC`), which changes existing lockout-duration test expectations; tracked for P20 alongside A-L4 (the other account-enumeration timing gap). | Deferred |
| — | Low hygiene (new — found in confirmation re-review) | `admin-auth.repository.ts` | `enrollMfa()` was dead code after A-M4 moved enrolment to `create-admin.ts` (no remaining callers) | Deleted; file header comment updated to describe the current (verification-only) responsibility of this repository | Fixed |

## (b) User data (transactions/categories/budgets/imports/reports/bookmarks/recurring)

| ID | Sev | Location | Finding | Fix | Status |
|---|---|---|---|---|---|
| B-M1 | Medium | `categories.repository.ts`, `recurring.repository.ts` (`update`/`delete`) | Ownership checked one layer up in the service only, not in the repository `where` clause — not exploitable today (see reviewer's race analysis) but breaks the "every query scoped by userId at the repository layer" rule and is shared by the admin module too | Added `userId`/`ownerKey`-scoped `updateOwned`/`deleteOwned` (and `updateDefault`/`deleteDefault` for admin's system categories) using `updateMany`/`deleteMany` + 404 on `count===0` | Fixed |
| B-M2 | Medium | `shared/src/schemas/budget.ts`, `budgets.service.ts` | `month` not forced to the first of the month → budget-alert lookups miss it; no cap on how many budget rows a user can create | Schema now rejects a non-first-of-month date (422); added a sane year range cap | Fixed |
| B-M3 | Medium | `imports.service.ts`, `imports.store.ts` | No per-user cap on open (uncommitted) import batches → Redis memory exhaustion (shared with sessions/rate-limits/BullMQ) | Capped open batches per user (3); 409 over the cap | Fixed |
| B-M4 | Medium | `reports.routes.ts`, `integrations/pdf/monthlyReport.pdf.ts` | PDF export has no dedicated rate limit — CPU DoS via repeated renders | Added a dedicated `reportsExport` preset (10/min per user) | Fixed |
| B-L1 | Low | `shared/src/schemas/common.ts`, `transaction.ts`, `category.ts`, `report.ts`, `bookmark.ts` | Integer/bigint id inputs have no upper bound → an out-of-range id can 500 instead of 404/422 | Added `.max()` bounds matching each column's real range | Fixed |
| B-L2 | Low | (same as A-L1) | — | Fixed together with A-L1 | Fixed |
| B-L3 | Low | `imports.parser.ts` → `imports.mapper.ts` | Raw exception `message` from csv-parse iteration surfaced to the client via `GET /imports/:id` | Returns a fixed `malformed-csv` message; raw error logged server-side only | Fixed |
| B-L4 | Low | `lib/idempotency.ts` | Idempotency key scoped only to `userId+key` (not method/path/body); no in-flight lock → replay/duplicate risk | Key now derived from `method + path + sha256(body)`; added a short-lived `SET NX` in-flight marker (409 while in flight); key format validated | Fixed |
| B-L5 | Low | `imports.store.ts` `withPreviewLock` | Unconditional `DEL` + fixed 5s TTL can release a still-in-use lock and let a second request steal/corrupt it | Random token + compare-and-delete Lua release; batched the category lookups in `updateRows` so it finishes well under the TTL | Fixed |
| B-L6 | Low | `transaction.ts` schema, `transactions.service.ts` | Client can send `aiSuggestedCategoryId=categoryId` to fake `ai_accepted` provenance (pre-flagged in PROGRESS.md P10) | **Deferred** — needs a signed suggestion token from `/ai/categorize`, bigger change; already tracked in PROGRESS.md for P19/P20, kept deferred | Deferred |
| B-L7 | Low | `reports.service.ts` share, `i18n/en.ts` | Sender-controlled `fullName`/`message` in the shared-report email enables phishing from a trusted CampusCoin address | Fixed together with C-L4 (see below) | Fixed |
| B-L8 | Low | `transaction.ts`, `bookmark.ts`, `import.ts` (`page`) | No upper bound on `page` → deep-offset query / potential 500 | Added `.max(10000)` | Fixed |

## (c) AI, email, config, frontend

| ID | Sev | Location | Finding | Fix | Status |
|---|---|---|---|---|---|
| C-H1 | **High** | `frontend/src/components/TawkWidget.tsx`, `app/router.tsx`, `ResetPasswordPage.tsx`, `VerifyEmailPage.tsx` | Live password-reset (30 min TTL) and email-verify (24 h TTL) tokens sit in `location.href` while Tawk.to's third-party embed is mounted on the same page and reports the visitor's URL to Tawk's servers — a compromised/malicious Tawk gets a working account-takeover link | TawkWidget now denylists `/reset-password`, `/verify-email`, `/login`, `/register`, `/forgot-password`, and all `/admin*` routes; `ResetPasswordPage`/`VerifyEmailPage` strip the token from the URL via `history.replaceState` right after reading it into state | Fixed |
| C-M1 | Medium | `TawkWidget.tsx`, `AuthContext.tsx`, `auth.controller.ts` | Tawk loaded on `/login`, `/register`, and all of `/app/*`, with same-origin `fetch` access to the shared admin/student refresh cookie/endpoint | Mitigated by the C-H1 denylist (Tawk no longer loads on any auth page); full admin/student origin split is an infra change out of this phase's scope — tracked below | Fixed (partial) / Deferred (full origin split) |
| C-M2 | Medium | `backend/src/middlewares/security.ts` vs `frontend/index.html` | SPA HTML itself has no CSP/security headers (helmet only covers the JSON API) — pre-flagged in PROGRESS.md P16 | Added a `<meta http-equiv="Content-Security-Policy">` fallback to `frontend/index.html` matching Table 57 (can't carry `frame-ancestors`); real header-level enforcement still needs nginx in P20 (already tracked there) | Fixed (partial) / Deferred (nginx headers, P20) |
| C-M3 | Medium | `integrations/mailer/transport.ts` | SMTP transport doesn't require TLS (`secure`/`requireTLS` unset) — a network attacker can strip STARTTLS and read `SMTP_PASS` + reset/verify links in cleartext | `requireTLS: true` (587) / `secure: true` (465) enforced outside dev/test (Mailpit unaffected) | Fixed |
| C-M4 | Medium | `jobs/queues.ts`, `auth.service.ts`, `reports.service.ts` | Email queue retains 1000 completed/failed jobs with full plaintext body (incl. reset/verify links); shared-report jobs embed the base64 PDF — all sitting in Redis (persisted to AOF) | `removeOnComplete:true`, `removeOnFail:{age:86400,count:100}` on the email queue; report-share job now carries `{userId, month, toEmail, message}` and renders the PDF inside the worker instead of storing it in job data | Fixed |
| C-L1 | Low | `lib/logger.ts` | Redaction paths only go 1 level deep (`req.body.token` etc. survive nested); `passwordHash`/`mfaSecretEnc` not listed; `code`/`*.code` redaction hides useful `err.code` diagnostics | Added deeper wildcard paths + `passwordHash`/`mfaSecretEnc`/`tokenHash`; narrowed the `code` redaction to specific body/header paths instead of blanket `err.code` | Fixed |
| C-L2 | Low | (same as A-L1) | — | Fixed together with A-L1 | Fixed |
| C-L3 | Low | `integrations/ai/prompts/insight.v1.ts` | Output sanitizer blocks `http(s)://`/`www.`/emails but not bare domains or `[url]`-style placeholders | Reused the input `BARE_DOMAIN_PATTERN` as an output-side reject rule | Fixed |
| C-L4 | Low | `i18n/en.ts`, `shared/src/schemas/auth.ts`, `report.ts` | Shared-report/register `fullName`/`message` fields accept control characters and URLs — phishing vector from a trusted sender address (same as B-L7) | Stripped control chars from `fullName`/`message`; `message` now rejects `http(s)://`/`www.` (reuses the existing URL-ban pattern) | Fixed |
| C-L5 | Low | `jobs/processors/email-send.processor.ts` | Logs the full recipient email address, including third-party share recipients | Logs a masked email (`maskEmail`) instead of the raw address | Fixed |
| C-L6 | Low | `config/env.ts` | Test-mode secret fallbacks (fixed JWT key pair etc.) trigger on any `NODE_ENV=test`, not just the real test runner | Fallbacks now also require `process.env.VITEST` or `CI` to be set | Fixed |
| C-L7 | Low | `integrations/pdf/fonts.ts` | `setLocalAccessPolicy` path check isn't normalized (`path.resolve` + prefix check) — no exploitable input today, but cheap to fix | Normalized with `path.resolve` + exact-prefix check | Fixed |

## Findings requiring an owner decision (deferred, tracked)

- **A-L3** – add `request_id` to `audit_logs` (schema migration) — P20.
- **A-L4** – forgot-password/register timing side-channel fix (move to worker-queued path) — P20.
- **A-L7** – admin TOTP: permanent-lock-after-N policy needs an owner call on the out-of-band unlock flow.
- **A-L11** – `failedLoginCount` needs the same 24h decay as the new shadow-lockout counter (A-M3), or an unknown-vs-real-account timing difference remains detectable across >24h probes; deferred because it touches existing lockout-duration test expectations — P20.
- **B-L6** – signed AI-suggestion token so a client can't fake `ai_accepted` provenance — already tracked in `PROGRESS.md` (P10 finding), unchanged.
- **C-M1/C-M2 (full)** – admin portal on a separate origin/subdomain with its own refresh cookie, and nginx-level CSP for the SPA — both P20 infra work; the practical mitigations available in application code (Tawk denylist, meta CSP) are done now.
- Pre-existing items already tracked in `PROGRESS.md` "Known issues" not duplicated here: `cc_app` DB grants (UPDATE/DELETE on `audit_logs`/`transaction_history`, table-level grants — P20), Redis `maxmemory-policy` infra note, data-encryption key rotation/keyring (P20).

## Automated checks (this phase)

- `npm audit` / `npm audit --omit=dev`: **0 vulnerabilities** (see Dependency vulnerabilities above).
- Secret scan: `gitleaks` isn't installable via `npx` in this environment (not an npm package under that name); ran an equivalent grep sweep of all tracked files for PEM headers / cloud API key patterns / hardcoded `password=`. Only hit: the intentionally-committed, documented `NODE_ENV=test`-only fake JWT keypair in `backend/src/config/env.ts` (see C-L6 above for the fix narrowing when it applies) — not a real secret.
- `.env` confirmed not committed (`.gitignore` covers `.env`/`.env.*`, only `.env.example` is tracked).
- Security headers (Table 57): asserted via new Supertest cases in `tests/integration/security/security-headers.test.ts`.
- Manual/E2E checks: `e2e/security.spec.ts` — XSS via description (TC-26), JWT `alg:none`/bad-signature rejected, refresh reuse (TC-04), rate limit (TC-28), `.exe` upload rejected (TC-18). Typechecks and lints clean; **not executed live this session** — the dev API server (`tsx watch`) never reached "listening" after several minutes despite the dev DB/Redis/Mailpit being up, tracked back to ~33 stray `node.exe` processes already running on this machine (confirmed via `tasklist`), the same pre-existing resource-contention issue already documented for P06/P08 in `PROGRESS.md` ("40+ stray node.exe processes... didn't reach listening"). Not a code regression — `npm run typecheck`/`lint` are clean and the backend integration + frontend unit suites (961 + 105 tests) pass against the same changes. Re-run `npx playwright test e2e/security.spec.ts` once the machine is quiet.
- Backend integration + frontend unit suites after all fixes (incl. the A-M5/A-L11 confirmation-review fixes): backend 965/967 passing, frontend 105/105 passing. Both backend failures are pre-existing documented flakes unrelated to this phase (categories TC-10 reassign-history race; `imports-preview.test.ts`'s AI-stub-categorization flake, matching `PROGRESS.md`'s P11 known-issues entry verbatim). `npm run lint`: 0 errors (36 pre-existing warnings in files this phase didn't touch). `npm run typecheck`: clean across all workspaces.
