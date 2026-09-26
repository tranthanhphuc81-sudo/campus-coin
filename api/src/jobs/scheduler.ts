import cron from "node-cron";

import { config } from "../config/env.js";
import { runCleanupJob } from "./cleanup.js";
import { runInsightsGenerationJob } from "./insights.js";
import { runRecurringMaterialization } from "./recurring.js";

const JOB_TIMEZONE = "Asia/Ho_Chi_Minh";

type JobRunner = () => Promise<void>;

function timestamp(): string {
  return new Date().toISOString();
}

function logInfo(message: string): void {
  process.stdout.write(`${message}\n`);
}

function logError(message: string): void {
  process.stderr.write(`${message}\n`);
}

function createSafeRunner(jobName: string, run: JobRunner): JobRunner {
  let running = false;

  return async () => {
    if (running) {
      logInfo(`[${jobName}] Skipped at ${timestamp()} because previous run is still in progress.`);
      return;
    }

    running = true;
    logInfo(`[${jobName}] Started at ${timestamp()}`);

    try {
      await run();
      logInfo(`[${jobName}] Finished at ${timestamp()}`);
    } catch (error) {
      logError(`[${jobName}] Failed at ${timestamp()}: ${String(error)}`);
    } finally {
      running = false;
    }
  };
}

export function startScheduler(): { stop: () => void } {
  if (!config.ENABLE_CRON) {
    logInfo("[scheduler] ENABLE_CRON is false. Cron jobs are disabled.");
    return {
      stop: () => {
        logInfo("[scheduler] Cron scheduler is not running.");
      },
    };
  }

  const recurringRunner = createSafeRunner("recurring.materialize", async () => {
    await runRecurringMaterialization();
  });

  const cleanupRunner = createSafeRunner("cleanup.expired", async () => {
    await runCleanupJob();
  });

  const insightsRunner = createSafeRunner("insights.generate", async () => {
    await runInsightsGenerationJob();
  });

  const recurringTask = cron.schedule(
    "5 0 * * *",
    () => {
      void recurringRunner();
    },
    { timezone: JOB_TIMEZONE },
  );

  const cleanupTask = cron.schedule(
    "0 3 * * *",
    () => {
      void cleanupRunner();
    },
    { timezone: JOB_TIMEZONE },
  );

  const insightsTask = cron.schedule(
    "30 0 1 * *",
    () => {
      void insightsRunner();
    },
    { timezone: JOB_TIMEZONE },
  );

  recurringTask.start();
  cleanupTask.start();
  insightsTask.start();

  logInfo("[scheduler] Cron scheduler started.");

  return {
    stop: () => {
      recurringTask.stop();
      cleanupTask.stop();
      insightsTask.stop();
      logInfo("[scheduler] Cron scheduler stopped.");
    },
  };
}
