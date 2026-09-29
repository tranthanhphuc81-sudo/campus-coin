/**
 * global-setup.ts
 * Runs once before the whole Playwright suite: seeds the demo accounts + datasets
 * (`backend/prisma/seed/demo.ts`) so every spec starts from the same known, deterministic state
 * (docs/spec/12 §12.3 Bảng 69). Uses `npm run db:seed -w backend -- --demo` rather than a full
 * `prisma migrate reset` — the demo seed already wipes+regenerates every demo user's own data on
 * every run (idempotent), a full reset would also drop/recreate the schema which is slower and
 * riskier to run unattended, and Prisma 7 additionally blocks `migrate reset` from an AI-agent
 * shell without explicit owner consent (see PROGRESS.md's 2026-09-26 P02 decision) — a targeted
 * re-seed sidesteps that entirely and is the fast, safe choice here.
 *
 * Safety: `seedDemo()` itself already refuses to run when `NODE_ENV=production`. This file adds a
 * second, independent guard on `DATABASE_URL`/`DATABASE_MIGRATOR_URL` so a misconfigured `.env`
 * pointing at a non-local host can never be seeded by an automated test run either.
 * Main exports: default (Playwright globalSetup)
 * Spec: docs/spec/12 (testing plan – E2E) · docs/spec/10 §11.5 · docs/spec/12 §12.3
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url)).replace(/[\\/]e2e$/, '');

/**
 * Local-only hostnames the seed is allowed to touch — anything else aborts the whole setup.
 * Bounded, non-nested quantifiers only (no catastrophic-backtracking shape); the security plugin's
 * generic heuristic still flags the `[^@]+@` credentials segment, hence the disable below.
 */
// eslint-disable-next-line security/detect-unsafe-regex
const LOCAL_HOST_PATTERN = /^(mysql:\/\/[^@]+@)?(localhost|127\.0\.0\.1|mysql)([:/]|$)/i;

/** Throws if `DATABASE_URL`/`DATABASE_MIGRATOR_URL` don't look like a local/dev database. */
function assertLocalDatabase(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('e2e/global-setup: refusing to seed — NODE_ENV=production.');
  }
  const urls = [process.env.DATABASE_URL, process.env.DATABASE_MIGRATOR_URL].filter(Boolean) as string[];
  for (const url of urls) {
    if (!LOCAL_HOST_PATTERN.test(url)) {
      throw new Error(
        `e2e/global-setup: refusing to seed — a configured database URL does not look local/dev (host check failed). ` +
          `Set E2E_SKIP_SEED=1 to run the suite without seeding if this is intentional.`,
      );
    }
  }
}

/**
 * Playwright `globalSetup`: re-seeds the 5 demo accounts + datasets before the suite runs.
 * Set `E2E_SKIP_SEED=1` to skip (e.g. when iterating on specs against data seeded a moment ago).
 */
export default function globalSetup(): void {
  const envFile = path.join(ROOT_DIR, '.env');
  // `envFile` is built from this file's own location, never from user/network input.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  if (process.env.E2E_SKIP_SEED === '1') {
    console.info('[e2e] E2E_SKIP_SEED=1 — skipping demo re-seed.');
    return;
  }

  assertLocalDatabase();

  console.info('[e2e] Re-seeding demo accounts + datasets (npm run db:seed -w backend -- --demo)…');
  const result = spawnSync('npm', ['run', 'db:seed', '-w', 'backend', '--', '--demo'], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    shell: true, // npm.cmd on Windows
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(
      `e2e/global-setup: demo seed failed (exit code ${String(result.status)}). ` +
        `Make sure MySQL is running and migrated (docker compose up -d && npm run db:migrate -w backend).`,
    );
  }
  console.info('[e2e] Demo data ready.');
}
