/**
 * index.ts (events)
 * Registers every domain-event handler on the shared bus. Called once from both entry points
 * (server.ts and worker.ts) — handlers just subscribe to events; only jobs/processors actually
 * run in the worker process.
 * Main exports: registerEventHandlers
 * Spec: docs/spec/04 §4.6 (domain events)
 */
import { registerAiLearningHandler } from './handlers/ai-learning.handler.js';
import { registerAnomalyDetectorHandler } from './handlers/anomaly-detector.handler.js';
import { registerBudgetAlertHandler } from './handlers/budget-alert.handler.js';
import { registerCacheInvalidatorHandler } from './handlers/cache-invalidator.handler.js';
import { registerTipsRefresherHandler } from './handlers/tips-refresher.handler.js';

/** Subscribes all domain-event handlers to the bus. Idempotent to call once per process. */
export function registerEventHandlers(): void {
  registerBudgetAlertHandler();
  registerAnomalyDetectorHandler();
  registerCacheInvalidatorHandler();
  registerAiLearningHandler();
  registerTipsRefresherHandler();
}
