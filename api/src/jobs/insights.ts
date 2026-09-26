import { runMonthlyInsightGeneration } from "../modules/insights/insight.service.js";

export async function runInsightsGenerationJob(now?: Date): Promise<void> {
  const result = await runMonthlyInsightGeneration({ now });
  process.stdout.write(
    `[insights.generate] processed=${result.processedUsers} success=${result.succeededUsers} failed=${result.failedUsers}\n`,
  );
}
