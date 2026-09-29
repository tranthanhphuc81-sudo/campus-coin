/**
 * prisma.ts
 * Prisma client singleton for the API and worker. Connects through the MariaDB driver
 * adapter (Prisma 7 has no built-in query engine) with the DML-only `cc_app` account
 * from DATABASE_URL. In development, queries slower than SLOW_QUERY_MS are logged.
 * Main exports: prisma, getPrisma, createPrismaClient, toPoolConfig
 * Spec: docs/spec/04 (architecture) · docs/spec/06 §6.1 (least privilege) · docs/spec/10 (performance)
 */
import { SLOW_QUERY_MS } from '@campuscoin/shared';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client.js';
import { logger } from './logger.js';

/** Max pooled connections per process (API and worker each get their own pool). */
const POOL_CONNECTION_LIMIT = 10;

/** Connection settings accepted by the MariaDB adapter. */
export interface PoolConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionLimit: number;
  /** MySQL 8 caching_sha2_password over plain TCP needs the server public key (dev only, no TLS). */
  allowPublicKeyRetrieval: boolean;
}

/**
 * Converts a `mysql://user:pass@host:port/db` URL into a MariaDB pool config.
 * @param url - Connection URL (DATABASE_URL).
 * @returns Pool config for {@link PrismaMariaDb}.
 * @throws Error when the URL is missing or has no database name.
 */
export function toPoolConfig(url: string | undefined): PoolConfig {
  if (!url) throw new Error('DATABASE_URL is not set');
  const parsed = new URL(url);
  const database = parsed.pathname.replace(/^\//, '');
  if (!database) throw new Error('DATABASE_URL has no database name');
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database,
    connectionLimit: POOL_CONNECTION_LIMIT,
    allowPublicKeyRetrieval: true,
  };
}

/**
 * Creates a new Prisma client. Prefer the shared {@link prisma} singleton; use this only for
 * scripts/tests that need their own connection (e.g. a different URL).
 * @param url - Connection URL; defaults to DATABASE_URL.
 * @returns A PrismaClient that must be `$disconnect()`-ed by the caller.
 */
export function createPrismaClient(url: string | undefined = process.env.DATABASE_URL) {
  const isDev = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';
  const client = new PrismaClient({
    adapter: new PrismaMariaDb(toPoolConfig(url)),
    log: isDev ? [{ emit: 'event', level: 'query' }] : [],
  });
  if (isDev) {
    // Only the SQL text is logged, never parameter values.
    client.$on('query', (event) => {
      if (event.duration > SLOW_QUERY_MS) {
        logger.warn({ durationMs: event.duration, query: event.query }, '[prisma] slow query');
      }
    });
  }
  return client;
}

/** Type of the application Prisma client. */
export type AppPrismaClient = ReturnType<typeof createPrismaClient>;

// Cache on globalThis so `tsx watch` reloads do not open a new pool on every restart.
const globalForPrisma = globalThis as unknown as { __campuscoinPrisma?: AppPrismaClient };

/**
 * Returns the process-wide Prisma client, creating it on first use.
 * @throws Error when DATABASE_URL is missing (only at first use, not at import time).
 */
export function getPrisma(): AppPrismaClient {
  globalForPrisma.__campuscoinPrisma ??= createPrismaClient();
  return globalForPrisma.__campuscoinPrisma;
}

/**
 * Shared Prisma client. Lazy proxy over {@link getPrisma}, so merely importing this module
 * never needs a database (unit tests, CI without MySQL).
 */
export const prisma: AppPrismaClient = new Proxy({} as AppPrismaClient, {
  get(_target, prop) {
    const client = getPrisma();
    const value: unknown = Reflect.get(client, prop, client);
    return typeof value === 'function'
      ? (value as (...a: unknown[]) => unknown).bind(client)
      : value;
  },
});
