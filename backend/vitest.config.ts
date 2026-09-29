/**
 * vitest.config.ts
 * Vitest setup for backend unit + integration tests (Node environment, Supertest for HTTP).
 * P18: coverage thresholds enforce >=80% lines/branches/functions/statements on every business
 * module (`src/modules/**`) and on the pure-function libs the phase brief names by name (stats,
 * forecast, recurrence, merchantKey, money, dates) plus the tips savings-tip rule engine
 * (`src/modules/tips/rules/**`, a subset of `src/modules/**` — listed again so it can never hide
 * behind another module's higher coverage in the aggregate). `npm run test -w backend` (no
 * `--coverage` flag) is unaffected — thresholds only apply when coverage is collected.
 * Spec: docs/spec/12 (testing plan)
 */
import { defineConfig } from 'vitest/config';

/** The 80% bar (Table 12.4 DoD) applied identically to every metric of a thresholded glob. */
const MIN_COVERAGE = { statements: 80, branches: 80, functions: 80, lines: 80 };

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup-env.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**'],
      // A handful of pre-existing, documented-flaky integration tests (see PROGRESS.md "Known
      // issues") occasionally fail under the full parallel/serial suite; coverage must still be
      // visible/enforced on a run like that instead of silently reporting nothing.
      reportOnFailure: true,
      thresholds: {
        'src/modules/**': MIN_COVERAGE,
        'src/modules/tips/rules/**': MIN_COVERAGE,
        'src/lib/stats.ts': MIN_COVERAGE,
        'src/lib/forecast.ts': MIN_COVERAGE,
        'src/lib/recurrence.ts': MIN_COVERAGE,
        'src/lib/merchantKey.ts': MIN_COVERAGE,
        'src/lib/money.ts': MIN_COVERAGE,
        'src/lib/dates.ts': MIN_COVERAGE,
      },
    },
  },
});
