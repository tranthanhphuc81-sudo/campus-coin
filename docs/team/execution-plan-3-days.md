# Campus Coin 3-Day Execution Plan (4 Members)

## Team Members and Roles

- Phuc (Team Lead): Integrator and shared/hotspot owner
- Tuan: Backend jobs owner
- Minh: Backend recurring-rules API owner
- Nhat Anh: Frontend transactions owner

## Branches

- Phuc: `feat/integration-shared`
- Tuan: `feat/be-recurring-jobs`
- Minh: `feat/be-recurring-rules-api`
- Nhat Anh: `feat/web-transactions`

## File Ownership (Conflict Prevention)

### Phuc (exclusive hotspot owner)

- `api/prisma/schema.prisma`
- `api/src/app.ts`
- `packages/shared/src/index.ts`
- `web/src/App.tsx`
- `web/src/layouts/StudentLayout.tsx`
- `web/src/content/en.ts`

### Tuan

- `api/src/jobs/**`
- `api/src/events/bus.ts`
- Job-related tests

### Minh

- `api/src/modules/recurring-rules/**`
- `api/tests/recurring-rules.test.ts`

### Nhat Anh

- `web/src/features/transactions/**`
- `web/src/pages/transactions/**`
- `web/src/lib/money.ts`

## Rules

- Do not edit files outside your lane.
- Rebase twice daily: 10:00 and 16:00.
- Keep PRs small and focused.
- Run validations in your scope before review.

## 3-Day Schedule

### Day 1 (Setup and Freeze)

- Morning
  - Phuc: lock architecture boundaries, publish ownership map
  - Tuan: scaffold jobs modules
  - Minh: scaffold recurring-rules module
  - Nhat Anh: scaffold transactions feature and pages
- Afternoon
  - Phuc: review lane scaffolds and merge safe scaffolds
  - Tuan: implement next-run-date and catch-up logic skeleton
  - Minh: implement input schema and ownership checks
  - Nhat Anh: implement query keys and page shell

### Day 2 (Parallel Implementation)

- Morning
  - Tuan: complete recurring/cleanup/scheduler logic
  - Minh: complete recurring-rules CRUD and future-only patch behavior
  - Nhat Anh: complete transactions list/filter/pagination
  - Phuc: hotspot-only support and API contract checks
- Afternoon
  - Tuan: add/finish unit tests for date edge cases and idempotency
  - Minh: add/finish recurring-rules integration tests
  - Nhat Anh: add/edit/trash/history flow implementation
  - Phuc: review and stage backend merge order

### Day 3 (Integration and Stabilization)

- Morning
  - Phuc: merge backend PRs first (Minh then Tuan)
  - Team: fix regressions quickly in lane only
  - Validate API: lint, typecheck, tests
- Afternoon
  - Nhat Anh: rebase frontend lane onto latest main and align with backend
  - Phuc: merge frontend PR
  - Team: final verification and bug fixes only (no new scope)

## Merge Order

1. `feat/integration-shared` (if needed for base/hotspot updates)
2. `feat/be-recurring-rules-api`
3. `feat/be-recurring-jobs`
4. `feat/web-transactions`

## Validation Commands

### Backend lanes

- `npm run lint -w api`
- `npm run typecheck -w api`
- `npm run test -w api`

### Frontend lane

- `npm run lint -w web`
- `npm run typecheck -w web`
- `npm run test -w web`

## Daily Standup Template (2 minutes each)

- Yesterday: what was completed
- Today: exact file/module targets
- Risks: blockers or expected conflicts
- Help needed: from whom and for what

## Quick Risk Escalation

- If a hotspot change is needed, open an issue/tag to Phuc, do not patch directly.
- If schema impact appears, stop lane work and align with Phuc first.
- If API contract changes, Minh and Nhat Anh sync before merge.
