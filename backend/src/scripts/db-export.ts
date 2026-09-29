/**
 * db-export.ts
 * Regenerates the two SRS-required database export files at the repo root:
 *   - `database/campus_coin_schema.sql` — full DDL, concatenated from
 *     `backend/prisma/migrations/<id>/migration.sql` in chronological order. `prisma migrate diff`
 *     (from the datamodel or from the migrations history) both lose the two hand-edits P02 made
 *     to the generated SQL — the `utf8mb4_0900_ai_ci` table collation and the CHECK constraints
 *     Prisma cannot model — so this concatenates the literal, already-applied migration files
 *     instead of re-deriving them.
 *   - `database/seed.sql` — a data-only dump (`mysqldump --no-create-info --complete-insert`) of
 *     the base/system rows (categories with `user_id IS NULL`, system tip templates, global
 *     announcements) plus the 5 `@campuscoin.demo` demo accounts and everything that belongs to
 *     them, in FK-safe insert order. Deliberately EXCLUDES `refresh_tokens`, `auth_tokens` and
 *     `audit_logs` (session/security secrets, never belong in a seed file) and `import_batches`
 *     (ephemeral upload state whose row preview lives in Redis, not MySQL) and any non-demo user
 *     (dev DBs double as the integration-test DB — P02 decision log — so `SELECT * FROM users`
 *     would otherwise pull in hundreds of throwaway `*.test.local` test accounts).
 * Usage: `npm run db:export -w backend` (requires `docker compose up -d` — runs `mysqldump`
 * inside the `mysql` container per CLAUDE.md's Windows rule: DB tools are not installed on the
 * host). Re-run any time the schema or the demo dataset changes.
 * Main exports: exportSchema, exportSeed (both for tests); CLI entry point by default.
 * Spec: docs/spec/06 §6.6 (migration/retention, export files)
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config/env.js';

const here = dirname(fileURLToPath(import.meta.url));
/** `backend/src/scripts/` is 3 levels below the repo root. */
const REPO_ROOT = path.resolve(here, '../../..');
const MIGRATIONS_DIR = path.resolve(here, '../../prisma/migrations');
const SCHEMA_OUT_PATH = path.join(REPO_ROOT, 'database', 'campus_coin_schema.sql');
const SEED_OUT_PATH = path.join(REPO_ROOT, 'database', 'seed.sql');

/** WHERE clause selecting the 5 `@campuscoin.demo` accounts (docs/spec + prisma/seed/demo.ts). */
const DEMO_USERS_WHERE = "email LIKE '%@campuscoin.demo'";
/** WHERE clause selecting any row owned by one of those accounts, via a `user_id` column. */
const OWNED_BY_DEMO_USER = `user_id IN (SELECT id FROM users WHERE ${DEMO_USERS_WHERE})`;
/** Same, for the nullable `created_by` column (system rows keep `created_by IS NULL`). */
const CREATED_BY_DEMO_ADMIN_OR_SYSTEM = `created_by IS NULL OR created_by IN (SELECT id FROM users WHERE ${DEMO_USERS_WHERE})`;

/** One table to dump, in FK-safe insert order, with its row filter. */
interface TableExport {
  table: string;
  where: string;
}

/**
 * Tables included in `seed.sql`, in an order that satisfies every FK (users first; anything
 * referencing `transactions`/`tip_templates`/`recurring_rules` after those). See file header for
 * the tables deliberately left out.
 */
const SEED_TABLES: TableExport[] = [
  { table: 'users', where: DEMO_USERS_WHERE },
  { table: 'categories', where: `user_id IS NULL OR ${OWNED_BY_DEMO_USER}` },
  { table: 'tip_templates', where: CREATED_BY_DEMO_ADMIN_OR_SYSTEM },
  { table: 'recurring_rules', where: OWNED_BY_DEMO_USER },
  { table: 'transactions', where: OWNED_BY_DEMO_USER },
  { table: 'transaction_history', where: OWNED_BY_DEMO_USER },
  { table: 'budgets', where: OWNED_BY_DEMO_USER },
  { table: 'insights', where: OWNED_BY_DEMO_USER },
  { table: 'user_tips', where: OWNED_BY_DEMO_USER },
  { table: 'ai_category_rules', where: OWNED_BY_DEMO_USER },
  { table: 'notifications', where: OWNED_BY_DEMO_USER },
  { table: 'bookmarks', where: OWNED_BY_DEMO_USER },
  { table: 'recent_activity', where: OWNED_BY_DEMO_USER },
  { table: 'announcements', where: CREATED_BY_DEMO_ADMIN_OR_SYSTEM },
];

/**
 * Concatenates every `backend/prisma/migrations/<id>/migration.sql` (chronological, directory-name
 * order — Prisma timestamps its migration folders) into `database/campus_coin_schema.sql`.
 */
export function exportSchema(): void {
  const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const header = [
    '-- =============================================================================',
    '-- campus_coin_schema.sql',
    '-- Full DDL for the CampusCoin schema (docs/spec/06 §6.6 database export), concatenated in',
    '-- order from backend/prisma/migrations/*/migration.sql — the literal SQL Prisma applied to',
    '-- every real database (dev/CI/prod), including hand-added CHECK constraints and the',
    '-- utf8mb4_0900_ai_ci table collation that `prisma migrate diff` cannot reconstruct from the',
    '-- datamodel alone (Prisma does not model CHECK constraints or per-table collation overrides).',
    '-- Regenerate: `npm run db:export -w backend` (also refreshes database/seed.sql).',
    '-- Run against a fresh, already-created database (see database/create_users.sql for the',
    '-- `campus_coin` database + `cc_app`/`cc_migrator` accounts).',
    '-- Source migrations (chronological order):',
    ...dirs.map((d) => `--   ${d}`),
    '-- =============================================================================',
    '',
  ].join('\n');

  let out = header;
  for (const dir of dirs) {
    const content = readFileSync(path.join(MIGRATIONS_DIR, dir, 'migration.sql'), 'utf8').replace(/\r\n/g, '\n');
    out += [
      '-- ---------------------------------------------------------------------------',
      `-- Migration: ${dir}`,
      '-- ---------------------------------------------------------------------------',
      '',
    ].join('\n');
    out += content.endsWith('\n') ? content : `${content}\n`;
    out += '\n';
  }

  writeFileSync(SCHEMA_OUT_PATH, out, { encoding: 'utf8' });
  console.info(`[db-export] wrote ${SCHEMA_OUT_PATH}`);
}

/** Parsed `user`/`password`/`database` fields this script needs out of `DATABASE_URL`. */
function parseAppDbCredentials(): { user: string; password: string; database: string } {
  const url = new URL(config.db.url);
  return {
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
  };
}

/**
 * Runs `mysqldump` for one table INSIDE the `mysql` compose container (CLAUDE.md: DB tools are
 * not installed on the Windows host) and returns its stdout.
 * @throws if `docker compose exec` exits non-zero (e.g. the container isn't running).
 */
function dumpTable(t: TableExport, creds: { user: string; password: string; database: string }): string {
  const args = [
    'compose',
    'exec',
    '-T',
    'mysql',
    'mysqldump',
    `-u${creds.user}`,
    `-p${creds.password}`,
    '--no-create-info',
    '--complete-insert',
    '--single-transaction',
    '--skip-add-locks',
    '--skip-comments',
    `--where=${t.where}`,
    creds.database,
    t.table,
  ];
  const result = spawnSync('docker', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`[db-export] mysqldump failed for table "${t.table}": ${result.stderr || result.error?.message}`);
  }
  return result.stdout.replace(/\r\n/g, '\n');
}

/**
 * Dumps {@link SEED_TABLES} (base/system rows + the 5 demo accounts and everything they own) via
 * `docker compose exec mysql mysqldump`, and writes the concatenated result to `database/seed.sql`.
 */
export function exportSeed(): void {
  const creds = parseAppDbCredentials();

  const header = [
    '-- =============================================================================',
    '-- seed.sql',
    '-- Base (system) + demo data dump (docs/spec/06 §6.6). Regenerate: `npm run db:export -w',
    '-- backend` (requires `docker compose up -d`). Demo accounts: see PROGRESS.md P17 / ',
    '-- backend/prisma/seed/demo.ts for the printed credentials. Deliberately excludes',
    '-- refresh_tokens, auth_tokens, audit_logs (secrets/ephemeral) and import_batches, and only',
    '-- includes the 5 `@campuscoin.demo` accounts (never the real bootstrapped admin or any',
    '-- integration-test-created account, even if the target DB currently has some).',
    '-- =============================================================================',
    '',
    'SET FOREIGN_KEY_CHECKS=0;',
    'SET NAMES utf8mb4;',
    '',
  ].join('\n');

  let out = header;
  for (const t of SEED_TABLES) {
    const dump = dumpTable(t, creds);
    out += `-- ---- ${t.table} ----\n`;
    out += dump.endsWith('\n') ? dump : `${dump}\n`;
    out += '\n';
  }
  out += 'SET FOREIGN_KEY_CHECKS=1;\n';

  writeFileSync(SEED_OUT_PATH, out, { encoding: 'utf8' });
  console.info(`[db-export] wrote ${SEED_OUT_PATH}`);
}

/** Runs both exports in order; schema first so a fresh reader sees DDL before data. */
function main(): void {
  exportSchema();
  exportSeed();
}

// Only auto-run as the actual CLI entry point — see create-admin.ts for why this guard exists.
const isCliEntryPoint = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isCliEntryPoint) {
  try {
    main();
  } catch (err: unknown) {
    console.error('[db-export] failed', err);
    process.exitCode = 1;
  }
}
