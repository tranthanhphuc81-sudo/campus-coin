import { prisma } from "../lib/prisma.js";

type Logger = {
  info: (message: string) => void;
  error: (message: string) => void;
};

const defaultLogger: Logger = {
  info: (message) => {
    process.stdout.write(`${message}\n`);
  },
  error: (message) => {
    process.stderr.write(`${message}\n`);
  },
};

function subtractHours(base: Date, hours: number): Date {
  return new Date(base.getTime() - hours * 60 * 60 * 1000);
}

function subtractDays(base: Date, days: number): Date {
  return new Date(base.getTime() - days * 24 * 60 * 60 * 1000);
}

export async function runCleanupJob(options?: { now?: Date; logger?: Logger }): Promise<void> {
  const logger = options?.logger ?? defaultLogger;
  const now = options?.now ?? new Date();

  try {
    const expiredTokenCutoff = subtractDays(now, 7);
    const stale24hCutoff = subtractHours(now, 24);
    const stale30DaysCutoff = subtractDays(now, 30);

    await prisma.refreshToken.deleteMany({
      where: {
        expiresAt: {
          lt: expiredTokenCutoff,
        },
      },
    });

    await prisma.authToken.deleteMany({
      where: {
        expiresAt: {
          lt: expiredTokenCutoff,
        },
      },
    });

    await prisma.importBatch.deleteMany({
      where: {
        updatedAt: {
          lt: stale24hCutoff,
        },
        status: {
          in: ["UPLOADED", "PARSING", "PREVIEWED", "EXPIRED"],
        },
      },
    });

    await prisma.idempotencyKey.deleteMany({
      where: {
        expiresAt: {
          lt: stale24hCutoff,
        },
      },
    });

    const transactionsToPurge = await prisma.transaction.findMany({
      where: {
        deletedAt: {
          lt: stale30DaysCutoff,
        },
      },
      select: {
        id: true,
      },
    });

    if (transactionsToPurge.length > 0) {
      const transactionIds = transactionsToPurge.map((item) => item.id);

      await prisma.transactionHistory.updateMany({
        where: {
          transactionId: {
            in: transactionIds,
          },
        },
        data: {
          snapshot: {
            redacted: true,
            reason: "transaction-purged",
          },
          changedFields: {
            redacted: true,
          },
        },
      });

      await prisma.transaction.deleteMany({
        where: {
          id: {
            in: transactionIds,
          },
        },
      });
    }

    const usersToDelete = await prisma.user.findMany({
      where: {
        deletedAt: {
          lt: stale30DaysCutoff,
        },
      },
      select: {
        id: true,
      },
    });

    for (const user of usersToDelete) {
      await prisma.$transaction(async (tx) => {
        await tx.transactionHistory.deleteMany({ where: { userId: user.id } });
        await tx.transaction.deleteMany({ where: { userId: user.id } });
        await tx.recurringRule.deleteMany({ where: { userId: user.id } });
        await tx.idempotencyKey.deleteMany({ where: { userId: user.id } });
        await tx.importBatch.deleteMany({ where: { userId: user.id } });
        await tx.category.deleteMany({ where: { userId: user.id } });
        await tx.authToken.deleteMany({ where: { userId: user.id } });
        await tx.refreshToken.deleteMany({ where: { userId: user.id } });
        await tx.user.delete({ where: { id: user.id } });
      });
    }

    logger.info("[cleanup.expired] Cleanup completed.");
  } catch (error) {
    logger.error(`[cleanup.expired] Cleanup failed: ${String(error)}`);
  }
}
