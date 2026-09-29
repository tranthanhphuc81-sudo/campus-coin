/**
 * prisma.config.ts
 * Prisma CLI configuration (migrate, generate, studio, seed). Prisma 7 no longer reads `.env`
 * by itself, so the root `.env` is loaded here (shell variables still win).
 * Migrations run with the privileged `cc_migrator` account (DATABASE_MIGRATOR_URL); the app
 * itself uses the DML-only `cc_app` account (DATABASE_URL, see src/lib/prisma.ts).
 * The shadow DB is `campus_coin_shadow` on the same server (created by database/create_users.sql).
 * Spec: docs/spec/06 §6.1, §6.6 · docs/spec/09 (least privilege)
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(here, '..', '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

/**
 * Derives the shadow-database URL from the migrator URL by swapping the database name.
 * @param url - MySQL connection URL of the main database, or undefined.
 * @returns The same URL pointing at `campus_coin_shadow`, or undefined.
 */
function toShadowUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const parsed = new URL(url);
  parsed.pathname = '/campus_coin_shadow';
  return parsed.toString();
}

const migratorUrl = process.env.DATABASE_MIGRATOR_URL;

export default defineConfig({
  schema: path.join(here, 'prisma', 'schema.prisma'),
  migrations: {
    path: path.join(here, 'prisma', 'migrations'),
    seed: 'tsx prisma/seed/index.ts',
  },
  datasource: {
    url: migratorUrl,
    shadowDatabaseUrl: toShadowUrl(migratorUrl),
  },
});
