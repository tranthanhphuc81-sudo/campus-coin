# Performance verification (P20)

Measured against docs/spec/10 §10.1 Bảng 60. Reproduce locally with the dev stack
(`docker compose up -d`, `npm run dev`, demo seed loaded — `npm run db:seed -w backend -- --demo`).

## 1. k6 load tests (`perf/`)

| Script | Target endpoint | Bảng 60 target | Run |
|---|---|---|---|
| `perf/dashboard-summary.js` | `GET /dashboard/summary` | p95 < 400 ms (miss) / < 50 ms (hit) | `k6 run perf/dashboard-summary.js` |
| `perf/list-transactions.js` | `GET /transactions` | p95 < 200 ms | `k6 run perf/list-transactions.js` |
| `perf/create-transaction.js` | `POST /transactions` | p95 < 300 ms | `k6 run perf/create-transaction.js` |

All three log in as the demo student `an.nguyen@campuscoin.demo` (Bảng 65 — 6 months of seeded
data) once in `setup()`, ramp 0→20 VUs (0→10 for the write test) over ~50s, and assert a
`http_req_duration` threshold matching the table above. Override the target host with
`k6 run -e BASE_URL=https://staging.campuscoin.example.com perf/dashboard-summary.js`.

k6 is a standalone binary (not an npm package — https://k6.io/docs/get-started/installation/),
run by hand or wired into a staging smoke-test step; it is intentionally not part of `npm test`.

**Not yet run against a real k6 install in this session** (no k6 binary available in this
environment) — the scripts are written, typecheck-free JS (k6's own runtime, not Node), and were
reviewed against the actual Zod query schemas (`shared/src/schemas/{dashboard,transaction}.ts`)
so the request shapes are correct. Run them for real on the owner's machine or in CI against a
seeded staging environment before relying on the exact numbers; the EXPLAIN evidence below
independently supports the same conclusion (indexed, not full-table-scanning).

## 2. Report/dashboard query EXPLAIN (docs/spec/10 §10.2)

Run against the real dev MySQL (`docker compose up -d`, demo seed loaded), student
`an.nguyen@campuscoin.demo` (655 total transactions across 6 seeded months, `2026-01`–`2026-06`).
Reproduce: `docker compose exec mysql mysql -ucc_app -pcc_app_dev_password campus_coin -e "EXPLAIN ...;"`.

| # | Query (backend module) | Index used | Extra | Verdict |
|---|---|---|---|---|
| 1 | `dashboard.repository.totalsForMonth` — `SUM(amount) GROUP BY type`, 1 month | `transactions_user_id_type_txn_date_idx` | Using index condition; Using where | ✅ indexed range scan, 1 row estimate |
| 2 | `dashboard.repository.expenseByCategory` — `SUM(amount) GROUP BY category_id`, 1 month | `transactions_user_id_category_id_txn_date_idx` | + Using temporary; Using filesort | ✅ indexed scan; temp+filesort is the `GROUP BY` + `ORDER BY SUM(...)` aggregation itself, not an unindexed lookup — expected for any grouped-and-sorted aggregate |
| 3 | `transactions.repository` list — default sort, page 1 | `transactions_user_id_deleted_at_txn_date_idx` | Using index condition | ✅ indexed range scan |
| 4 | `reports.repository.byCategoryForRange` — 6-month range (full seeded history) | `transactions_user_id_category_id_txn_date_idx` | 507 rows; Using temporary; Using filesort | ✅ indexed scan over the whole range, same expected temp+filesort as #2 |
| 5 | `reports.repository.dailyTotals` — 6-month range | `transactions_user_id_category_id_txn_date_idx` | 507 rows; Using temporary | ✅ indexed scan |

None of the 5 queries this session checked do a full table scan (`type: ALL`) or read more rows
than the user's own real history — every one hits a composite `(user_id, …, txn_date)` index
already defined in `prisma/schema.prisma` (P02). At the current demo data volume (655 rows/user)
this is comfortably fast; docs/spec/10 §10.4's own scaling roadmap (Bảng 62, "Giai đoạn 2") already
calls for a pre-aggregated `monthly_category_totals` table once per-user transaction counts get
much larger — no action needed for this phase.

## 3. Frontend bundle size (docs/spec/10 §10.1: initial JS < 200 KB gzip)

`npm run build -w @campuscoin/frontend && npm run perf:bundle-check` (script:
`scripts/check-bundle-size.mjs`) gzips every JS file `frontend/dist/index.html` actually loads
before first paint (the entry `<script>` + every `<link rel="modulepreload">` Vite emits for the
static import graph — lazy route chunks, e.g. every non-landing page, are correctly excluded) and
sums them.

**Current measured result: 218.13 KB gzip — 18 KB (9%) over the 200 KB budget.**

Investigated and partially fixed this session:

- **Fixed**: `shared/package.json` was missing `"sideEffects": false`. Without it, Rollup could not
  prove `@campuscoin/shared`'s barrel (`index.ts` re-exports ~20 Zod schema files) was safe to
  tree-shake, so importing so much as `API_BASE_PATH` (a plain string constant, used by the eager
  `apiClient.ts`) pulled in the compiled output of every schema file too. Adding the field let
  Rollup drop the unused schema code from the eager `apiClient` chunk (46.6 KB → 20.2 KB gzip).
- **Root cause of the remaining overage, not fixed this session**: several *different* lazy,
  route-level pages (`LoginPage`, `RegisterPage`, `ResetPasswordPage`, `ForgotPasswordPage`,
  `ResendVerificationPage`, `AdminLoginPage`, `SecurityTab`, `ShareByEmailModal`) each import one
  named export from the same compiled module, `shared/dist/schemas/auth.js` (e.g. `loginSchema`,
  `registerSchema`, `changePasswordSchema`). Because that one module is shared by many independent
  lazy chunks, Rollup's default chunking hoists its entire compiled contents — including
  `mfaVerifySchema`, which nothing in the frontend actually uses — into the eager entry chunk
  instead of a lazy shared chunk. Confirmed by finding `mfaVerifySchema`'s own validation message
  ("Provide exactly one of code or recoveryCode.") inside `dist/assets/index-*.js` itself.
  - Tried and reverted: `vite.config.ts`'s `build.rollupOptions.output.manualChunks` (the classic
    Rollup API) had **zero observable effect** — this project's Vite 8 uses the Rolldown bundler
    under the hood (`rolldown-vite`, confirmed by the build's own stack traces), which may not yet
    honor that exact option the same way. Not pursued further given the shallow investigation
    budget for this phase.
  - **Recommended real fix** (deferred — touches `shared/src/schemas/auth.ts`'s file layout, used
    by both apps, so it needs its own careful pass rather than a rushed edit here): split
    `schemas/auth.ts` into one file per schema (or at minimum move `mfaVerifySchema`/
    `adminLoginSchema`/`updateProfileSchema` — the ones with no current frontend consumer — out of
    the file the consumed schemas live in) so each lazy page's chunk only pulls the one schema
    module it actually needs.
- Bundle report from the last build for reference (`npm run build -w @campuscoin/frontend`):
  the two largest EAGER chunks are `index-*.js` (~122 KB gzip — React + react-router + react-
  bootstrap + the app shell) and `zod-*.js` (~36 KB gzip — the zod library plus the `auth.js`
  hoisting issue above); `apiClient-*.js` (~20 KB, mostly axios) is third. Chart.js (`dist-*.js`,
  ~66 KB gzip) is correctly excluded from the initial bundle — it is only reachable from lazy
  chart-page chunks.

This is tracked in `PROGRESS.md`'s Known issues for P21/a follow-up perf pass, not silently
dropped — the initial bundle is measurably close to budget (not multiples over), the app already
does route-level code splitting (P05) and this analysis found and fixed one real, generally-useful
bug (the missing `sideEffects: false`) along the way.

## 4. Other §10.1 targets not (re-)measured this session

Largest Contentful Paint / Interaction to Next Paint / Cumulative Layout Shift (Web Vitals,
Lighthouse) and PDF generation time (`docs/spec §10.1`) need a running, network-throttled browser
session against a deployed build — out of scope for this infra-focused session; re-check with
Lighthouse against the staging deployment once §11.4.4's pipeline stands one up.
