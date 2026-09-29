/**
 * index.ts
 * Seed entry point: `npm run db:seed -w backend` (base seed) or
 * `npm run db:seed -w backend -- --demo` (base + demo accounts, P17).
 * Connects with the runtime DATABASE_URL (cc_app, DML only) – seeding needs no DDL.
 * Never run --demo against real production data (spec §6.5).
 * Spec: docs/spec/06 §6.5
 */
import { createPrismaClient } from '../../src/lib/prisma.js';
import { seedBase } from './base.js';
import { seedDemo } from './demo.js';

/**
 * Runs the seed and exits with code 1 on failure.
 */
async function main(): Promise<void> {
  const withDemo = process.argv.includes('--demo');
  const prisma = createPrismaClient();
  try {
    const result = await seedBase(prisma);
    console.info(
      `[seed] base: ${result.categories} default categories, ${result.tipTemplates} tip templates`,
    );
    if (withDemo) {
      const demoResult = await seedDemo(prisma);
      console.info(`[seed] demo: ${demoResult.usersCreated} users, ${demoResult.transactionsCreated} transactions`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

// The `@prisma/adapter-mariadb` driver adapter's underlying native connection pool does not
// always release the Node event loop after `$disconnect()` — without a forced exit, this CLI
// script hangs indefinitely instead of returning to the caller (observed: `db:seed -- --demo`
// processes idling for hours, each holding an open pool, and blocking anything that shells out
// to this script and waits for it to exit, e.g. Playwright's globalSetup).
main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('[seed] failed', err);
    process.exit(1);
  });
